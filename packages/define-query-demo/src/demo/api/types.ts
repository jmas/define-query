export type Post = {
  id: string;
  title: string;
  body: string;
  commentCount: number;
};

export type Comment = {
  id: string;
  text: string;
  createdAt: string;
  deleted?: boolean;
};

export type TimelinePage = {
  items: Post[];
  total: number;
  page: number;
  pageSize: number;
};
