import { useState } from 'react';
import { Utensils } from 'lucide-react';

interface FoodImageProps {
  src: string;
  alt: string;
  className?: string;
}

export function FoodImage({ src, alt, className = '' }: FoodImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (failed || !src) return <div className={`food-image food-image--fallback ${className}`} role="img" aria-label={`${alt} image unavailable`}><Utensils size={20} /></div>;
  return <img className={`food-image ${loaded ? 'is-loaded' : 'is-loading'} ${className}`} src={src} alt={alt} loading="lazy" decoding="async" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />;
}
