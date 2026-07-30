import { useState } from 'react';

// Parent main image with a graceful fallback: if the Amazon CDN image fails
// (or none is set), show a category-colored tile with the category code so the
// row still looks intentional.
export default function ProductImage({ src, cat, alt }) {
  const [broken, setBroken] = useState(!src);
  if (broken) {
    return <span className={`thumb thumb-fallback cat-${cat}`}>{cat || '—'}</span>;
  }
  return (
    <img
      className="thumb"
      src={src}
      alt={alt || ''}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}
