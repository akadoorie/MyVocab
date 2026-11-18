import { buildCard, toLanguageMap, type CardView, type ItemType } from '@myvocab/core';
import type { BotCheck } from '../auth/turnstile';
import {
  BotCheckFailedError,
  ForbiddenError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
} from '../middleware/errors';
import type {
  CategoryRepository,
  LanguageRepository,
  LoopRepository,
  LoopSelection,
} from '../repositories/interfaces';
import type { SettingsService } from './settings-service';
import type { UsageLimitService } from './usage-limit-service';

export type Requester =
  | { kind: 'guest'; ipHash: string; ip: string | null }
  | { kind: 'learner'; userId: string; isAdmin: boolean };

export type LoopQuery = {
  source: string;
  target: string;
  type: ItemType;
  categoryId: number | null;
};

export type StartLoopInput = LoopQuery & { size?: number; turnstileToken?: string };

export type StartLoopResult = { requested: number; returned: number; cards: CardView[] };

/** Learning loops (PRD §6.1–6.4, §12.1). */
export class LoopService {
  constructor(
    private readonly deps: {
      languages: LanguageRepository;
      categories: CategoryRepository;
      loops: LoopRepository;
      settings: SettingsService;
      limits: UsageLimitService;
      botCheck: BotCheck;
    },
  ) {}

  private async selection(q: LoopQuery, userId: string | null): Promise<LoopSelection> {
    const languages = (await this.deps.languages.listAll()).filter((l) => l.isActive);
    const codes = new Set(languages.map((l) => l.code));
    if (!codes.has(q.source) || !codes.has(q.target)) {
      throw new ValidationError('Unknown or inactive language');
    }
    if (q.categoryId !== null) {
      const category = (await this.deps.categories.listAll()).find((c) => c.id === q.categoryId);
      if (!category?.isActive) throw new ValidationError('Unknown or inactive category');
    }
    return { ...q, userId };
  }

  async available(q: LoopQuery, requester: Requester): Promise<number> {
    const userId = requester.kind === 'learner' ? requester.userId : null;
    return this.deps.loops.countPlayable(await this.selection(q, userId));
  }

  async start(input: StartLoopInput, requester: Requester): Promise<StartLoopResult> {
    const settings = await this.deps.settings.get();
    const isAdmin = requester.kind === 'learner' && requester.isAdmin;
    if (settings['maintenance.enabled'] && !isAdmin) {
      throw new ForbiddenError(settings['maintenance.message'] || 'MyVocab is under maintenance');
    }

    let size: number;
    if (requester.kind === 'guest') {
      if (!settings['guests.enabled']) throw new UnauthorizedError('Sign in to start a session');
      // Bot check first: an unverified request must not write anything (PRD §11.2 rule 5).
      if (!(await this.deps.botCheck.verify(input.turnstileToken, requester.ip))) {
        throw new BotCheckFailedError();
      }
      const decision = await this.deps.limits.checkGuestLoop(
        requester.ipHash,
        settings['guests.loopsPerHour'],
      );
      if (!decision.allowed) {
        throw new RateLimitedError('Too many sessions for now. Sign in or try again later.');
      }
      size = settings['guests.loopSize']; // guests can't choose (FR-L6)
    } else {
      size = input.size ?? settings['loop.defaultSize'];
      if (!settings['loop.sizeOptions'].includes(size) || size > settings['loop.maxSize']) {
        throw new ValidationError(
          `Amount must be one of ${settings['loop.sizeOptions'].join(', ')}`,
        );
      }
    }

    const selection = await this.selection(
      input,
      requester.kind === 'learner' ? requester.userId : null,
    );
    if (requester.kind === 'learner' && !isAdmin) {
      const decision = await this.deps.limits.checkLearnerCards(
        requester.userId,
        size,
        settings['users.cardsPerDay'],
      );
      if (!decision.allowed) {
        throw new RateLimitedError('Daily card limit reached', { remaining: decision.remaining });
      }
    }

    const items = await this.deps.loops.selectPlayable(selection, size);
    const languages = toLanguageMap(
      (await this.deps.languages.listAll()).filter((l) => l.isActive),
    );
    const cards = items.map((item) => buildCard(item, input.target, languages));

    if (requester.kind === 'guest') await this.deps.limits.recordGuestLoop(requester.ipHash);
    else if (!isAdmin) await this.deps.limits.recordLearnerCards(requester.userId, cards.length);

    return { requested: size, returned: cards.length, cards };
  }
}
