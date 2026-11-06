-- Apply after the schema exists. The expression matches searchPublishedContent.
CREATE INDEX IF NOT EXISTS "ContentItem_search_ru_idx"
ON "ContentItem" USING GIN (
  to_tsvector('russian'::regconfig, coalesce("title", '') || ' ' || coalesce("summary", '') || ' ' || coalesce("code", ''))
);
