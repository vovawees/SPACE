/* Типы, общие для клиента и сервера: всё, что ходит по HTTP API. */

/** Роли на доске — по возрастанию прав. Хост — со-владелец: участники,
    приглашения и настройки доски; владелец ещё может удалить или передать доску. */
export type Role = "owner" | "host" | "editor" | "commenter" | "viewer";
export const ROLES: Role[] = ["viewer", "commenter", "editor", "host", "owner"];
export const ROLE_LABELS: Record<Role, string> = {
  owner: "Владелец",
  host: "Хост",
  editor: "Редактор",
  commenter: "Комментатор",
  viewer: "Зритель",
};
export const roleRank = (r: Role | null | undefined) => (r ? ROLES.indexOf(r) + 1 : 0);
export const atLeastRole = (r: Role | null | undefined, need: Role) => roleRank(r) >= roleRank(need);

export type LinkAccess = "none" | "view" | "comment" | "edit";

/** Ранги на сервере — по возрастанию. Владелец сервера — первый вошедший. */
export type Rank = "guest" | "member" | "vip" | "admin" | "owner";
export const RANKS: Rank[] = ["guest", "member", "vip", "admin", "owner"];
export const RANK_LABELS: Record<Rank, string> = {
  guest: "Гость",
  member: "Участник",
  vip: "Особый",
  admin: "Администратор",
  owner: "Владелец сервера",
};
export const rankRank = (r: Rank | null | undefined) => (r ? RANKS.indexOf(r) + 1 : 0);

/** Лимиты ранга. 0 — без ограничения. */
export interface RankLimits {
  /** Своих досок. */
  boards: number;
  /** Один файл, МБ. */
  uploadMB: number;
  /** Все свои файлы, МБ. */
  storageMB: number;
  /** Участников на своей доске. */
  members: number;
  /** Может создавать доски. */
  create: boolean;
  /** Может загружать файлы. */
  upload: boolean;
  /** Может выдавать приглашения на сервер. */
  invite: boolean;
}

export type Registration = "open" | "invite" | "closed";

export interface ServerSettings {
  name: string;
  registration: Registration;
  /** Ранг нового аккаунта без приглашения. */
  defaultRank: Rank;
  limits: Record<Rank, RankLimits>;
}

/** Настройки доски (меняют владелец и хосты). */
export interface BoardSettings {
  /** Заморозить: править могут только хосты и владелец. */
  lock: boolean;
  /** Кто пишет в чат доски. */
  chat: "all" | "editors" | "off";
  /** Кто может приглашать (видит ссылки-приглашения). */
  invite: "all" | "editors" | "hosts";
  /** Кто восстанавливает версии из истории. */
  history: "editors" | "hosts";
  /** Скачивать файл доски и делать копию могут все, а не только хосты. */
  copy: boolean;
  /** Предел участников, 0 — без предела (и не больше лимита ранга владельца). */
  maxMembers: number;
}

/** Что можно мне на этой доске — считает сервер. */
export interface BoardPerms {
  edit: boolean;
  comment: boolean;
  chat: boolean;
  invite: boolean;
  manage: boolean;
  restore: boolean;
  copy: boolean;
}

export interface BoardLink {
  id: string;
  role: Exclude<Role, "owner">;
  label: string | null;
  uses: number;
  maxUses: number | null;
  expiresAt: number | null;
  createdAt: number;
  createdBy: UserRef | null;
}

export interface Invite {
  code: string;
  rank: Rank;
  uses: number;
  maxUses: number | null;
  expiresAt: number | null;
  note: string | null;
  createdAt: number;
  createdBy: UserRef | null;
}

export interface Usage {
  boards: number;
  /** Байт в своих файлах. */
  storage: number;
}

export interface AdminUser extends UserRef {
  login: string | null;
  rank: Rank;
  banned: boolean;
  createdAt: number;
  seenAt: number;
  boards: number;
  storage: number;
  sessions: number;
}

export interface ServerStats {
  users: number;
  boards: number;
  files: number;
  storage: number;
  online: number;
}

export interface UserRef {
  id: string;
  name: string;
  color: string;
}

export interface Me extends UserRef {
  login: string | null;
  hasPassword: boolean;
  createdAt: number;
  rank: Rank;
  limits: RankLimits;
  usage: Usage;
}

export interface BoardSummary {
  id: string;
  title: string;
  role: Role;
  perms: BoardPerms;
  settings: BoardSettings;
  owner: UserRef;
  linkAccess: LinkAccess;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  openedAt: number | null;
  /** URL превью (с версией в query, чтобы не залипал кэш) или null. */
  thumb: string | null;
  nodes: number;
  /** Кто сейчас на доске. */
  online: UserRef[];
}

export interface Member extends UserRef {
  role: Role;
  openedAt: number | null;
  banned?: boolean;
}

export interface SnapshotInfo {
  id: number;
  createdAt: number;
  authors: UserRef[];
  nodes: number;
  label: string | null;
}

export interface FileInfo {
  hash: string;
  size: number;
  mime: string;
  name: string;
}

export interface Unfurl {
  url: string;
  kind: "page" | "image" | "video" | "audio" | "file";
  title?: string;
  description?: string;
  image?: string;
  icon?: string;
  site?: string;
  mime?: string;
  /** false — сайт запрещает показ во фрейме (X-Frame-Options / frame-ancestors). */
  embeddable?: boolean;
  /** Короткие факты: звёзды и язык репозитория, статус задачи, версия, цена. */
  facts?: string[];
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export interface ServerInfo {
  version: string;
  name: string;
  inviteRequired: boolean;
  registration: Registration;
  maxUploadMB: number;
}
