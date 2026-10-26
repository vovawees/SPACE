/* Типы, общие для клиента и сервера: всё, что ходит по HTTP API. */

export type Role = "owner" | "editor" | "viewer";
export type LinkAccess = "none" | "view" | "edit";

export interface UserRef {
  id: string;
  name: string;
  color: string;
}

export interface Me extends UserRef {
  login: string | null;
  hasPassword: boolean;
  createdAt: number;
}

export interface BoardSummary {
  id: string;
  title: string;
  role: Role;
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
  inviteRequired: boolean;
  maxUploadMB: number;
}
