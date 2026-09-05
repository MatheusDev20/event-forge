/** Catalog's own description of a venue list request, free of any wire concern. */
export type ListVenuesCriteria = {
  search?: string;
  city?: string;
  page: number;
  pageSize: number;
};
