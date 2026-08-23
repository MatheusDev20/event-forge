export type HttpClient = {
  GET: (details: RequestDetails) => Promise<any>;
};

export type RequestDetails = {
  path: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
};
