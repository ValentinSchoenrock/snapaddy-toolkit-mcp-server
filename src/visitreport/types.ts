export interface Option { id: string; label: string; mappingId?: string; value?: string }
export interface Question {
  id: string;
  mappingId?: string;
  title: string;
  type?: string;
  options?: Option[];
  questions?: Question[];
}
export interface Group { id: string; name: string; questions?: Question[] }
export interface CustomField { id?: string; name: string; value?: string }
export interface VrEvent {
  id: string;
  mappingId?: string;
  defaultLanguage?: string;
  title: string;
  status?: string;
  updatedAt?: string;
  groups?: Group[];
  questions?: Question[];
  customFields?: CustomField[];
}
export interface Report {
  id: string;
  eventId?: string;
  status?: string;
  createdAt?: string;
  [key: string]: unknown;
}
export interface WorkflowTrigger { type: string;[key: string]: unknown }
export interface Workflow {
  id: string;
  name: string;
  status?: string;
  eventIds: string[];
  triggers: WorkflowTrigger[];
}
export interface ReportPage { reports: Report[]; hasMore: boolean }
