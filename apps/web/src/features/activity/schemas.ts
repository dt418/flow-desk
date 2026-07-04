import { z } from 'zod';
import { taskActivityWithUserSchema } from '@flow-desk/shared/task';

export const activityListResponseSchema = z.object({
  data: z.array(taskActivityWithUserSchema),
  nextCursor: z.string().nullable(),
});
export type ActivityListResponse = z.infer<typeof activityListResponseSchema>;
