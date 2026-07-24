import type { ExtractedEvent } from './extractionSpec'
import type { CropType, CropEvent } from '../db'

export interface AIProvider {
  extract(entryText: string, roster: CropType[], openProblems: CropEvent[]): Promise<ExtractedEvent[]>
}

export class StubAIProvider implements AIProvider {
  async extract(): Promise<ExtractedEvent[]> {
    throw new Error('not implemented')
  }
}
