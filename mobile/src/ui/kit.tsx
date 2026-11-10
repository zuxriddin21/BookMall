import React from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type PressableProps, type TextInputProps, type TextStyle, type ViewStyle, type StyleProp, RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft, Star, BadgeCheck } from 'lucide-react-native';
import { C, F, R, S } from '@/theme';
import { ApiError } from '@/api/client';

export function T({ style, variant = 'body', ...p }: React.ComponentProps<typeof Text> & { variant?: 'display' | 'title' | 'h2' | 'body' | 'small' | 'label' | 'muted' }) {
  return <Text {...p} style={[ts[variant], style]} />;
}
const ts = StyleSheet.create({
  display: { fontFamily: F.display, fontSize: 28, color: C.ink, lineHeight: 34 },
  title: { fontFamily: F.display, fontSize: 22, color: C.ink, lineHeight: 28 },
  h2: { fontFamily: F.bold, fontSize: 16, color: C.ink },
  body: { fontFamily: F.body, fontSize: 15, color: C.text, lineHeight: 21 },
  small: { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 18 },
  label: { fontFamily: F.semibold, fontSize: 12, color: C.muted, letterSpacing: 0.4, textTransform: 'uppercase' },
  muted: { fontFamily: F.body, fontSize: 14, color: C.muted },
});

export function Screen({ children, scroll = true, title, back = true, right, refreshing, onRefresh, padded = true, edges }: {
  children: React.ReactNode; scroll?: boolean; title?: string; back?: boolean; right?: React.ReactNode;
  refreshing?: boolean; onRefresh?: () => void; padded?: boolean; edges?: ('top' | 'bottom')[];
}) {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[padded && { padding: S.lg, gap: S.lg }, { paddingBottom: 40 }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={C.primary} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padded && { padding: S.lg }]}>{children}</View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={edges ?? ['top']}>
      {title !== undefined && <Header title={title} back={back} right={right} />}
      {body}
    </SafeAreaView>
  );
}

export function Header({ title, back = true, right }: { title: string; back?: boolean; right?: React.ReactNode }) {
  return (
    <View style={st.header}>
      {back ? (
        <Pressable accessibilityLabel="Orqaga" hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={st.iconBtn}>
          <ChevronLeft size={24} color={C.ink} />
        </Pressable>
      ) : <View style={{ width: 8 }} />}
      <Text numberOfLines={1} style={st.headerTitle}>{title}</Text>
      <View style={{ minWidth: 40, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, icon, style, small }: {
  title: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  loading?: boolean; disabled?: boolean; icon?: React.ReactNode; style?: StyleProp<ViewStyle>; small?: boolean;
}) {
  const v = btn[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [st.btn, small && st.btnSmall, v.box, (disabled || loading) && { opacity: 0.5 }, pressed && { opacity: 0.8 }, style]}
    >
      {loading ? <ActivityIndicator color={v.text.color} /> : (
        <>
          {icon}
          <Text style={[st.btnText, small && { fontSize: 13 }, v.text]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}
const btn: Record<string, { box: ViewStyle; text: TextStyle }> = {
  primary: { box: { backgroundColor: C.primary }, text: { color: C.primaryInk } },
  secondary: { box: { backgroundColor: C.surfaceAlt }, text: { color: C.ink } },
  outline: { box: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.line }, text: { color: C.ink } },
  ghost: { box: { backgroundColor: 'transparent' }, text: { color: C.primary } },
  danger: { box: { backgroundColor: C.danger }, text: { color: '#fff' } },
};

export function Field({ label, error, hint, style, ...p }: TextInputProps & { label?: string; error?: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label && <T variant="label">{label}</T>}
      <TextInput
        placeholderTextColor={C.faint}
        accessibilityLabel={label ?? p.placeholder}
        {...p}
        style={[st.input, p.multiline && { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }, error && { borderColor: C.danger }, style]}
      />
      {error ? <Text style={st.err}>{error}</Text> : hint ? <T variant="small">{hint}</T> : null}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: PressableProps['onPress'] }) {
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [st.card, pressed && { opacity: 0.85 }, style]}>{children}</Pressable>;
  return <View style={[st.card, style]}>{children}</View>;
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[st.chip, active && { backgroundColor: C.primary, borderColor: C.primary }]}>
      <Text style={[st.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map((o) => <Chip key={o.value} label={o.label} active={o.value === value} onPress={() => onChange(o.value)} />)}
    </ScrollView>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warn' | 'danger' | 'primary' }) {
  const bg = { neutral: C.surfaceAlt, success: C.successSoft, warn: C.warnSoft, danger: C.dangerSoft, primary: C.primary }[tone];
  const fg = { neutral: C.text, success: C.success, warn: '#7A5A12', danger: C.danger, primary: '#fff' }[tone];
  return <View style={[st.badge, { backgroundColor: bg }]}><Text style={[st.badgeText, { color: fg }]}>{label}</Text></View>;
}

export function Avatar({ uri, name, size = 40 }: { uri?: string | null; name?: string; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.surfaceAlt }} contentFit="cover" />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontFamily: F.bold, fontSize: size * 0.4 }}>{(name ?? '?').trim().charAt(0).toUpperCase()}</Text>
    </View>
  );
}

const COVER_COLORS = ['#5A5A40', '#1F5E3B', '#7A3E2B', '#2E4A7D', '#8A5A12', '#4B3A78', '#1F6A82', '#A23B4F'];
export function BookCover({ uri, title, width = 72 }: { uri?: string | null; title: string; width?: number }) {
  const h = width * 1.45;
  if (uri) return <Image source={{ uri }} style={{ width, height: h, borderRadius: 6, backgroundColor: C.surfaceAlt }} contentFit="cover" transition={150} />;
  const color = COVER_COLORS[[...title].reduce((a, c) => a + c.charCodeAt(0), 0) % COVER_COLORS.length];
  return (
    <View style={{ width, height: h, borderRadius: 6, backgroundColor: color, padding: 6, justifyContent: 'flex-end' }}>
      {width >= 50
        ? <Text numberOfLines={4} style={{ color: '#fff', fontFamily: F.display, fontSize: width / 7, lineHeight: width / 5.5 }}>{title}</Text>
        : <Text style={{ color: '#fff', fontFamily: F.display, fontSize: width / 2.2, textAlign: 'center', alignSelf: 'stretch' }}>{title.trim().charAt(0).toUpperCase()}</Text>}
    </View>
  );
}

export function Stars({ value, size = 14, onChange }: { value: number | null; size?: number; onChange?: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: onChange ? 8 : 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable key={i} disabled={!onChange} onPress={() => onChange?.(i)} hitSlop={6} accessibilityLabel={`${i} yulduz`}>
          <Star size={size} color={C.gold} fill={value && i <= value ? C.gold : 'transparent'} />
        </Pressable>
      ))}
    </View>
  );
}

export const Verified = () => <BadgeCheck size={15} color={C.green} />;

export function Loading() {
  return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={C.primary} /></View>;
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
      <T variant="h2" style={{ textAlign: 'center' }}>{title}</T>
      {text && <T variant="muted" style={{ textAlign: 'center' }}>{text}</T>}
      {action}
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 12 }}>
      <T variant="muted" style={{ textAlign: 'center' }}>{errorText(error)}</T>
      {onRetry && <Button title="Qayta urinish" variant="secondary" small onPress={onRetry} />}
    </View>
  );
}

export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return <View style={st.formErr}><Text style={st.err}>{errorText(error)}</Text></View>;
}

export const errorText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Xatolik yuz berdi');
export const fieldErr = (e: unknown, k: string) => (e instanceof ApiError ? e.fields[k] : undefined);

/** Tasdiqlash oynasi (telefonda — tizim oynasi, brauzerda — confirm). */
export function confirm(title: string, message: string, okText = 'Ha', destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Bekor qilish', style: 'cancel', onPress: () => resolve(false) },
      { text: okText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
export function notice(title: string, message?: string) {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

export function Row({ children, style, gap = S.sm }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={{ gap: S.md }}>
      <Row style={{ justifyContent: 'space-between' }}><T variant="h2">{title}</T>{action}</Row>
      {children}
    </View>
  );
}

export function useBottomPad() {
  return useSafeAreaInsets().bottom;
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, height: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, backgroundColor: C.bg, gap: 4 },
  headerTitle: { flex: 1, fontFamily: F.bold, fontSize: 17, color: C.ink },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  btn: { height: 50, borderRadius: R.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  btnSmall: { height: 38, paddingHorizontal: 14, borderRadius: R.sm },
  btnText: { fontFamily: F.bold, fontSize: 15 },
  input: { minHeight: 50, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 14, backgroundColor: C.surface, fontFamily: F.body, fontSize: 16, color: C.ink },
  err: { color: C.danger, fontFamily: F.medium, fontSize: 13 },
  formErr: { backgroundColor: C.dangerSoft, padding: 12, borderRadius: R.md },
  card: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: S.lg, gap: S.sm },
  chip: { paddingHorizontal: 14, height: 34, borderRadius: R.pill, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: F.semibold, fontSize: 13, color: C.text },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.pill, alignSelf: 'flex-start' },
  badgeText: { fontFamily: F.bold, fontSize: 11 },
});
