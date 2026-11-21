import type { PublicUser } from '@foodlog/shared';
import { PresetAvatar } from './presetAvatars.tsx';

export function Avatar({
  user,
  className = 'h-9 w-9',
}: {
  user: Pick<PublicUser, 'avatar' | 'avatarVersion'>;
  className?: string;
}) {
  const classes = `${className} shrink-0 overflow-hidden rounded-full`;
  if (user.avatar === 'upload') {
    return (
      <img
        src={`/api/me/avatar?v=${user.avatarVersion}`}
        alt=""
        className={`${classes} object-cover`}
      />
    );
  }
  const index = Number(user.avatar.replace('preset:', '')) || 1;
  return (
    <span className={classes}>
      <PresetAvatar index={index} className="h-full w-full" />
    </span>
  );
}
