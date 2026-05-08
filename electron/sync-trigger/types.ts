export type OnlineProbe = () => Promise<boolean>;

export type Notifier = (title: string, body: string) => void;

export interface PowerEvents {
  on(event: 'suspend' | 'resume', listener: () => void): void;
  off(event: 'suspend' | 'resume', listener: () => void): void;
}
