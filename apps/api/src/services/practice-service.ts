import { buildCard, toLanguageMap, type CardView } from '@myvocab/core';
import type { BotCheck } from '../auth/turnstile';
import {
  BotCheckFailedError,
  ForbiddenError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
} from '../middleware/errors';
import type {
  TopicRepository,
  LanguageRepository,
  PracticeRepository,
  PracticeSelection,
  PlayableCounts,
} from '../repositories/interfaces';
import type { SettingsService } from './settings-service';
import type { UsageLimitService } from './usage-limit-service';

export type Requester =
  | { kind: 'guest'; ipHash: string; ip: string | null }
  | { kind: 'learner'; userId: string; isAdmin: boolean };

export type PracticeQuery = {
  source: string;
  target: string;
  topicId: number | null;
  /** Ask for the sample set only (D-038). Honoured for admins; guests always get it. */
  sample?: boolean | undefined;
};

export type StartPracticeInput = PracticeQuery & { size?: number; turnstileToken?: string };

export type StartPracticeResult = { requested: number; returned: number; cards: CardView[] };

/** Learning practices (PRD §6.1–6.4, §12.1). */
export class PracticeService {
  constructor(
    private readonly deps: {
      languages: LanguageRepository;
      topics: TopicRepository;
      practices: PracticeRepository;
      settings: SettingsService;
      limits: UsageLimitService;
      botCheck: BotCheck;
    },
  ) {}

  /**
   * What a requester may play (D-038): guests always get the sample set across every topic,
   * whatever they ask for; admins get it when they ask (to check what guests see); other
   * learners never do.
   */
  private async selection(q: PracticeQuery, requester: Requester): Promise<PracticeSelection> {
    await this.checkLanguages(q.source, q.target);
    const sampleOnly = requester.kind === 'guest' || (requester.isAdmin && q.sample === true);
    const topicId = sampleOnly ? null : q.topicId;
    if (topicId !== null) {
      const topic = (await this.deps.topics.listAll()).find((c) => c.id === topicId);
      if (!topic?.isActive) throw new ValidationError('Unknown or inactive topic');
    }
    return {
      source: q.source,
      target: q.target,
      topicId,
      sampleOnly,
      userId: requester.kind === 'learner' ? requester.userId : null,
    };
  }

  private async checkLanguages(source: string, target: string): Promise<void> {
    const languages = (await this.deps.languages.listAll()).filter((l) => l.isActive);
    const codes = new Set(languages.map((l) => l.code));
    if (!codes.has(source) || !codes.has(target)) {
      throw new ValidationError('Unknown or inactive language');
    }
  }

  async available(q: PracticeQuery, requester: Requester): Promise<number> {
    return this.deps.practices.countPlayable(await this.selection(q, requester));
  }

  /**
   * Every count for one direction, for the Topic list (D-064). A learner's own known words are
   * left out. Guests get the full counts, a preview of what signing in unlocks; what they can
   * play is the `sample` count (D-038).
   */
  async availableByTopic(
    q: { source: string; target: string },
    requester: Requester,
  ): Promise<PlayableCounts> {
    await this.checkLanguages(q.source, q.target);
    return this.deps.practices.countPlayableByTopic({
      source: q.source,
      target: q.target,
      userId: requester.kind === 'learner' ? requester.userId : null,
    });
  }

  async start(input: StartPracticeInput, requester: Requester): Promise<StartPracticeResult> {
    const settings = await this.deps.settings.get();
    const isAdmin = requester.kind === 'learner' && requester.isAdmin;
    if (settings['maintenance.enabled'] && !isAdmin) {
      throw new ForbiddenError(settings['maintenance.message'] || 'MyVocab is under maintenance');
    }

    let size: number;
    if (requester.kind === 'guest') {
      if (!settings['guests.enabled']) throw new UnauthorizedError('Sign-in to start a practice');
      // Bot check first: an unverified request must not write anything (PRD §11.2 rule 5).
      if (!(await this.deps.botCheck.verify(input.turnstileToken, requester.ip))) {
        throw new BotCheckFailedError();
      }
      const decision = await this.deps.limits.checkGuestPractice(
        requester.ipHash,
        settings['guests.practicesPerHour'],
      );
      if (!decision.allowed) {
        throw new RateLimitedError('Too many practices for now. Sign-in or try again later.');
      }
      size = settings['guests.practiceSize']; // guests can't choose (FR-L6)
    } else {
      size = input.size ?? settings['practice.defaultSize'];
      if (!settings['practice.sizeOptions'].includes(size) || size > settings['practice.maxSize']) {
        throw new ValidationError(
          `Amount must be one of ${settings['practice.sizeOptions'].join(', ')}`,
        );
      }
    }

    const selection = await this.selection(input, requester);
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

    const items = await this.deps.practices.selectPlayable(selection, size);
    const languages = toLanguageMap(
      (await this.deps.languages.listAll()).filter((l) => l.isActive),
    );
    const cards = items.map((item) => buildCard(item, input.target, languages));

    if (requester.kind === 'guest') await this.deps.limits.recordGuestPractice(requester.ipHash);
    else if (!isAdmin) await this.deps.limits.recordLearnerCards(requester.userId, cards.length);

    return { requested: size, returned: cards.length, cards };
  }
}
