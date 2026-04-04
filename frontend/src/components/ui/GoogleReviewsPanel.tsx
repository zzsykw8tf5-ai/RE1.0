import { useEffect, useState } from 'react';
import { Star, ExternalLink, MapPin } from 'lucide-react';
import { getGoogleReviews } from '../../services/api';
import type { GoogleReviewsResult } from '../../services/api';

interface Props {
  name: string;
  address?: string;
  city?: string;
  compact?: boolean;
}

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={size}
          className={i <= Math.round(rating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 fill-gray-300'}
        />
      ))}
    </span>
  );
}

export default function GoogleReviewsPanel({ name, address, city, compact = false }: Props) {
  const [data, setData] = useState<GoogleReviewsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!name) return;
    setLoading(true);
    getGoogleReviews(name, address, city)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [name, address, city]);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-apple-text-tertiary">
        <div className="w-3 h-3 border border-apple-gray-4 border-t-transparent rounded-full animate-spin" />
        Google…
      </div>
    );
  }

  if (!data) return null;

  if (!data.available) {
    const searchUrl = data.search_url;
    if (!searchUrl) return null;
    return (
      <a
        href={searchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-apple-blue hover:underline"
      >
        <MapPin size={11} />
        Google Maps
        <ExternalLink size={10} />
      </a>
    );
  }

  const { rating, user_ratings_total, maps_url, reviews, name: placeName } = data;

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {rating != null && <Stars rating={rating} size={12} />}
        {rating != null && <span className="text-xs font-medium text-apple-text">{rating.toFixed(1)}</span>}
        {user_ratings_total != null && (
          <span className="text-xs text-apple-text-tertiary">({user_ratings_total})</span>
        )}
        {maps_url && (
          <a href={maps_url} target="_blank" rel="noopener noreferrer" className="text-xs text-apple-blue hover:underline inline-flex items-center gap-0.5">
            Maps <ExternalLink size={9} />
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 border border-apple-gray-2 rounded-apple bg-white">
      {/* Header row */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-apple-gray rounded-apple transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-apple-text">{placeName || name}</span>
          {rating != null && <Stars rating={rating} size={13} />}
          {rating != null && <span className="text-xs font-semibold text-apple-text">{rating.toFixed(1)}</span>}
          {user_ratings_total != null && (
            <span className="text-xs text-apple-text-secondary">· {user_ratings_total} Bewertungen</span>
          )}
        </div>
        <span className="text-xs text-apple-blue ml-2">{expanded ? 'Weniger' : 'Bewertungen'}</span>
      </button>

      {expanded && reviews && reviews.length > 0 && (
        <div className="border-t border-apple-gray-2 px-4 py-3 space-y-3">
          {reviews.map((r, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2">
                {r.profile_photo ? (
                  <img src={r.profile_photo} alt={r.author} className="w-6 h-6 rounded-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-apple-gray-3 flex items-center justify-center text-[10px] font-semibold text-apple-text-secondary">
                    {r.author.charAt(0)}
                  </div>
                )}
                <span className="text-xs font-medium text-apple-text">{r.author}</span>
                <Stars rating={r.rating} size={11} />
                <span className="text-[10px] text-apple-text-tertiary ml-auto">{r.time}</span>
              </div>
              {r.text && (
                <p className="text-xs text-apple-text-secondary leading-relaxed ml-8 line-clamp-3">{r.text}</p>
              )}
            </div>
          ))}
          {maps_url && (
            <a
              href={maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-apple-blue hover:underline mt-1"
            >
              Alle Bewertungen auf Google Maps <ExternalLink size={11} />
            </a>
          )}
        </div>
      )}

      {expanded && (!reviews || reviews.length === 0) && (
        <div className="border-t border-apple-gray-2 px-4 py-3 text-xs text-apple-text-tertiary">
          Keine Bewertungen verfügbar.
          {maps_url && (
            <a href={maps_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-apple-blue hover:underline inline-flex items-center gap-0.5">
              Google Maps <ExternalLink size={10} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
