import type { HelpLang, HelpTopic } from '../../../src/lib/help-paths'

export type { HelpLang, HelpTopic }

export interface HelpTopicCopy {
  /** Page title and h1. */
  title: string
  /** One line under the title, also the meta description. */
  desc: string
  /** [heading, paragraph] — a paragraph may hold `code` in backticks. */
  sections: [string, string][]
}

export interface HelpCopy {
  ui: {
    hub: string
    hubIntro: string
    /** The preview notice on every page. */
    preview: string
    all: string
    home: string
    pricing: string
  }
  topics: Record<HelpTopic, HelpTopicCopy>
}
