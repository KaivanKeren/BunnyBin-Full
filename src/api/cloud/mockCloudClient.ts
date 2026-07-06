import type { ICloudClient, QuizItem, SyncPayload } from '../contracts';
import { staticQuizItems } from '../../data/quizItems';

export class MockCloudClient implements ICloudClient {
  async getQuizBank(): Promise<QuizItem[]> {
    return staticQuizItems; // bank soal statis yang sudah dibundel (§3)
  }

  async syncLogs(unitId: string, payload: SyncPayload): Promise<void> {
    console.log(`[mock sync] unit ${unitId}:`, payload); // tidak benar-benar kirim kemana-mana
  }
}
