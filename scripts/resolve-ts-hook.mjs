/** Lets `node scripts/review-shows.mjs` import the site's TypeScript data files. */
export async function resolve(specifier, context, nextResolve) {
  const relative = specifier.startsWith('./') || specifier.startsWith('../');
  const hasExt = /\.(ts|js|mjs|cjs|json|css|astro)$/.test(specifier);
  if (relative && !hasExt) return nextResolve(specifier + '.ts', context);
  return nextResolve(specifier, context);
}
