export interface AutomationRule {
  id: string; name: string; enabled: boolean;
  trigger: string; conditions: string[]; actions: string[];
}
export interface HomeEvent {
  id: string; type: string; entityId: string | null; createdAt: string;
}
export interface HomeActivity {
  automations(signal?: AbortSignal): Promise<AutomationRule[]>;
  events(signal?: AbortSignal): Promise<HomeEvent[]>;
}
