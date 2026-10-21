export type Currency = "CDF" | "USD";
export type Frequency = "daily" | "weekly" | "monthly";
export type DayMode = "all" | "weekdays" | "custom";
export type Role = "admin" | "member";
export type ContributionStatus = "paid" | "partial" | "late" | "pending";
export type TxStatus = "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED" | "CANCELLED" | "EXPIRED";
export type Acceptance = "pending" | "accepted" | "refused";
export type Threshold = "simple" | "twothirds" | "unanimity";
export type HealthLevel = "stable" | "watch" | "alert";

export interface Member {
  id: string;
  name: string;
  phone: string;
  role: Role;
}

export interface Due {
  id: string;
  index: number;
  /** ISO yyyy-mm-dd */
  date: string;
  beneficiaryId: string;
}

export interface Transaction {
  id: string;
  ref: string;
  groupId: string;
  dueId: string;
  memberId: string;
  amount: number;
  currency: Currency;
  msisdn: string;
  status: TxStatus;
  createdAt: string;
  /** part of the amount credited to the contribution (defaults to amount) */
  contributionAmount?: number;
  /** late penalty included in the amount */
  penaltyAmount?: number;
  dueDate?: string | undefined;
  daysLate?: number;
}

export interface LatePenaltySettings {
  enabled: boolean;
  amount: number;
}

export interface PenaltyRecord {
  dueId: string;
  memberId: string;
  amount: number;
  status: "applied" | "paid" | "waived";
  daysLate: number;
}

export interface SwapRequest {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  fromPosition: number;
  toPosition: number;
  /** "earlier" = the requester wants to receive sooner */
  direction: "earlier" | "later";
  status: "pending" | "awaiting_vote" | "accepted" | "refused";
  voteId?: string;
  createdAt: string;
}

export interface VoteResponse {
  memberId: string;
  answer: "yes" | "no";
  at: string;
}

export interface Vote {
  id: string;
  title: string;
  description: string;
  deadline: string;
  threshold: Threshold;
  status: "open" | "approved" | "rejected";
  createdBy: string;
  createdAt: string;
  responses: VoteResponse[];
  /** set when the vote decides a turn exchange */
  swapId?: string;
}

export interface ContractRules {
  lateRule: string;
  swapRule: string;
  exitRule: string;
  voteRule: string;
  /** a turn exchange must also pass a group vote */
  swapNeedsVote: boolean;
  threshold: Threshold;
}

export interface Reminders {
  before3: boolean;
  before1: boolean;
  dayOf: boolean;
  afterLate: boolean;
}

export interface LogEntry {
  id: string;
  at: string;
  text: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  currency: Currency;
  maxMembers: number;
  amount: number;
  frequency: Frequency;
  dayMode: DayMode;
  /** 0=Sunday … 6=Saturday */
  weekdays: number[];
  startDate: string;
  totalDues: number;
  members: Member[];
  /** member ids, index = turn position - 1 */
  order: string[];
  dues: Due[];
  transactions: Transaction[];
  swaps: SwapRequest[];
  votes: Vote[];
  logs: LogEntry[];
  rules: ContractRules;
  /** memberId -> acceptance of the digital contract */
  acceptances: Record<string, Acceptance>;
  reminders: Reminders;
  latePenalty?: LatePenaltySettings;
  penalties?: PenaltyRecord[];
  /** subscription payer mode chosen at creation */
  subscriptionMode?: "same" | "rotate" | "custom";
}

export interface ZukiState {
  currentUserId: string;
  groups: Group[];
}
