// The pure pagination function: document blocks in, page breaks out (SPEC 5.8).
export { COLUMNS, LINES_PER_PAGE, UPPERCASE, spaceBefore } from './geometry';
export {
  linesOf,
  paginate,
  type Block,
  type Item,
  type Page,
  type PageBreak,
  type Pagination,
} from './paginate';
export { wrap, type WrappedLine } from './wrap';
