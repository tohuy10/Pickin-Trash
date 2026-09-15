// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<string, ComponentProps<typeof MaterialIcons>['name']>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'calendar': 'event',
  'plus.circle.fill': 'add-circle',
  'qrcode.viewfinder': 'qr-code-scanner',
  'tray.fill': 'inbox',
  'person.fill': 'person',
  'envelope.fill': 'email',
  'lock.fill': 'lock',
  'building.2.fill': 'business',
  'checkmark.circle.fill': 'check-circle',
  'location.fill': 'location-on',
  'clock.fill': 'schedule',
  'person.circle.fill': 'account-circle',
  'message.fill': 'message',
  'star.fill': 'star',
  'heart.fill': 'favorite',
  'gear.fill': 'settings',
  'magnifyingglass': 'search',
  'xmark': 'close',
  'plus': 'add',
  'minus': 'remove',
  'trash.fill': 'delete',
  'pencil': 'edit',
  'camera.fill': 'camera-alt',
  'photo.fill': 'photo',
  'map.fill': 'map',
  'list.bullet': 'list',
  'square.and.arrow.up': 'share',
  'square.and.arrow.down': 'file-download',
  'arrow.left': 'arrow-back',
  'arrow.right': 'arrow-forward',
  'arrow.up': 'arrow-upward',
  'arrow.down': 'arrow-downward',
  'chevron.up': 'keyboard-arrow-up',
  'chevron.down': 'keyboard-arrow-down',
  'chevron.left': 'chevron-left',
  'info.circle.fill': 'info',
  'exclamationmark.triangle.fill': 'warning',
  'checkmark': 'check',
  'xmark.circle.fill': 'cancel',
  'questionmark.circle.fill': 'help',
  'eye.fill': 'visibility',
  'eye.slash.fill': 'visibility-off',
  'bell.fill': 'notifications',
  'bell.slash.fill': 'notifications-off',
  'bookmark.fill': 'bookmark',
  'bookmark.slash.fill': 'bookmark-border',
  'flag.fill': 'flag',
  'tag.fill': 'local-offer',
  'folder.fill': 'folder',
  'doc.fill': 'description',
  'link': 'link',
  'globe': 'language',
  'wifi': 'wifi',
  'wifi.slash': 'wifi-off',
  'battery.100': 'battery-full',
  'battery.75': 'battery-6-bar',
  'battery.50': 'battery-4-bar',
  'battery.25': 'battery-2-bar',
  'battery.0': 'battery-0-bar',
  'volume.3.fill': 'volume-up',
  'volume.2.fill': 'volume-down',
  'volume.1.fill': 'volume-down',
  'volume.slash.fill': 'volume-off',
  'play.fill': 'play-arrow',
  'pause.fill': 'pause',
  'stop.fill': 'stop',
  'forward.fill': 'fast-forward',
  'backward.fill': 'fast-rewind',
  'shuffle': 'shuffle',
  'repeat': 'repeat',
  'repeat.1': 'repeat-one',
  'music.note': 'music-note',
  'music.note.list': 'queue-music',
  'mic.fill': 'mic',
  'mic.slash.fill': 'mic-off',
  'video.fill': 'videocam',
  'video.slash.fill': 'videocam-off',
  'phone.fill': 'phone',
  'phone.slash.fill': 'phone-disabled',
  'facetime': 'video-call',
  'message.circle.fill': 'chat',
  'bubble.left.fill': 'chat-bubble',
  'bubble.right.fill': 'chat-bubble-outline',
  'text.bubble.fill': 'sms',
  'mail.fill': 'mail',
  'mail.stack.fill': 'mail-outline',
  'paperplane': 'send',
  'square.and.pencil': 'edit',
  'pencil.circle.fill': 'edit',
  'scissors': 'content-cut',
  'doc.on.doc.fill': 'content-copy',
  'doc.on.clipboard.fill': 'content-paste',
  'arrow.clockwise': 'refresh',
  'arrow.counterclockwise': 'undo',
  'arrow.uturn.backward': 'undo',
  'arrow.uturn.forward': 'redo',
  'arrow.triangle.2.circlepath': 'sync',
  'arrow.triangle.2.circlepath.circle.fill': 'sync',
  'arrow.up.arrow.down': 'swap-vert',
  'arrow.left.arrow.right': 'swap-horiz',
  'arrow.up.left.and.arrow.down.right': 'open-in-full',
  'arrow.down.right.and.arrow.up.left': 'close-fullscreen',
  'arrow.up.left.and.down.right.and.arrow.up.right.and.down.left': 'fullscreen',
  'arrow.up.left.and.down.right.magnifyingglass': 'zoom-in',
  'arrow.down.right.and.up.left.magnifyingglass': 'zoom-out',
  'plus.magnifyingglass': 'zoom-in',
  'minus.magnifyingglass': 'zoom-out',
  '1.magnifyingglass': 'search',
  '2.magnifyingglass': 'search',
  '3.magnifyingglass': 'search',
  '4.magnifyingglass': 'search',
  '5.magnifyingglass': 'search',
  '6.magnifyingglass': 'search',
  '7.magnifyingglass': 'search',
  '8.magnifyingglass': 'search',
  '9.magnifyingglass': 'search',
  '0.magnifyingglass': 'search',
  // Additional icons used in the app
  'line.3.horizontal.decrease': 'filter-list',
  'person.2.fill': 'group',
  'person.badge.plus': 'person-add',
  'person.circle': 'account-circle',
  'rectangle.portrait.and.arrow.right': 'logout',
  'location.circle.fill': 'my-location',
  'qrcode': 'qr-code',
  'calendar.badge.plus': 'event-available',
  'leaf.fill': 'eco',
  // Reward icons
  'cup.and.saucer.fill': 'local-cafe',
  'gift.fill': 'card-giftcard',
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
