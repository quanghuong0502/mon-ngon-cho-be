import React from 'react';
import { getOptimizedUrl } from '../lib/cloudinary';

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

const Avatar: React.FC<AvatarProps> = ({ src, name, size = 36, className = "" }) => {
  if (src) {
    return (
      <img 
        src={getOptimizedUrl(src, Math.round(size * 1.5))} 
        alt={name || 'Avatar'}
        referrerPolicy="no-referrer"
        className={className}
        style={{ 
          width: size, 
          height: size, 
          borderRadius: '50%', 
          objectFit: 'cover',
          display: 'block'
        }} 
      />
    );
  }

  const initials = name
    ?.split(' ')
    .filter(Boolean)
    .slice(-2)
    .map(w => w[0])
    .join('')
    .toUpperCase() || '?';

  return (
    <div 
      className={className}
      style={{
        width: size, 
        height: size, 
        borderRadius: '50%',
        backgroundColor: 'var(--primary)',
        color: 'var(--primary-foreground)',
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        fontSize: size * 0.38, 
        fontWeight: 600,
        flexShrink: 0
      }}
    >
      {initials}
    </div>
  );
};

export default Avatar;
