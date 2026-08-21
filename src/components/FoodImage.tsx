import { useState } from 'react';
import { Utensils } from 'lucide-react';

interface FoodImageProps {
  src: string;
  alt: string;
  className?: string;
}

export function FoodImage({ src, alt, className = '' }: FoodImageProps) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={`food-image food-image--fallback ${className}`} role="img" aria-label={`${alt} image unavailable`}><Utensils size={20} /></div>;
  return <img className={`food-image ${className}`} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}
