export const AVATARS = {
  ibis_0:  require("@/assets/profile_pics/ibis_0.png"),
  ibis_1:    require("@/assets/profile_pics/ibis_1.png"),
  ibis_2:      require("@/assets/profile_pics/ibis_2.png"),
  ibis_3:    require("@/assets/profile_pics/ibis_3.png"),
  ibis_4:  require("@/assets/profile_pics/ibis_4.png"),
  ibis_5:    require("@/assets/profile_pics/ibis_5.png"),
  ibis_6:      require("@/assets/profile_pics/ibis_6.png"),
  ibis_7:    require("@/assets/profile_pics/ibis_7.png"),
  ibis_8:    require("@/assets/profile_pics/ibis_8.png"),
  // add more as needed…
} as const;

export type AvatarKey = keyof typeof AVATARS;
export const DEFAULT_AVATAR: AvatarKey = "ibis_0";
