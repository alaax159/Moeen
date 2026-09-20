import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'link' && { color: theme.primary },
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'linkPrimary' && { color: theme.primary },
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    ...Typography.caption,
  },
  smallBold: {
    ...Typography.label,
    fontWeight: 700,
  },
  default: {
    ...Typography.body,
  },
  title: {
    fontFamily: Fonts.sans,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: 800,
    letterSpacing: -0.5,
  },
  subtitle: {
    ...Typography.pageTitle,
  },
  link: {
    ...Typography.bodyStrong,
  },
  linkPrimary: {
    ...Typography.bodyStrong,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
    lineHeight: 17,
  },
});
