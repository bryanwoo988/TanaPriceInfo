// Example screen: MPOB FFB prices + searchable FAMA list, with source links
// and freshness. Plain React Native components only.
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Linking, Pressable, RefreshControl,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { usePrices } from './usePrices';
import {
  FamaItem, FamaLevel, Region, REGION_NAMES, Source, fmtDate, fmtRM, freshness,
} from './tanaPrices';

const LEVELS: FamaLevel[] = ['Ladang', 'Borong', 'Runcit'];

const C = {
  bg: '#f4f6f3', card: '#ffffff', text: '#17201a', muted: '#5d6b62', line: '#e2e7e3',
  brand: '#1f6f43', okBg: '#dff3e7', warnBg: '#fff4d6', warnInk: '#7a5600', down: '#c0392b',
};

function SourceBar({ src }: { src?: Source }) {
  const f = freshness(src);
  const pill = f.level === 'ok' ? styles.pillOk : styles.pillWarn;
  const ink = f.level === 'ok' ? C.brand : f.level === 'failed' ? C.down : C.warnInk;
  return (
    <View style={styles.src}>
      <View style={styles.row}>
        <Text style={[styles.pill, pill, { color: ink }]}>● {f.label}</Text>
        {src?.url ? (
          <Pressable onPress={() => Linking.openURL(src.url)} hitSlop={8} accessibilityRole="link">
            <Text style={styles.link}>Semak di {src.name} ↗</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.small}>
        {src?.date_kind === 'collected' ? 'Tarikh dikutip' : 'Harga bertarikh'}: {fmtDate(src?.data_date)}
        {f.ageDays != null ? ` (${f.ageDays === 0 ? 'hari ini' : `${f.ageDays} hari lalu`})` : ''}
      </Text>
      {src?.ok === false ? (
        <Text style={[styles.small, { color: C.down }]}>Kutipan terakhir gagal. Harga mungkin lama.</Text>
      ) : null}
    </View>
  );
}

export default function PricesScreen() {
  const { data, loading, refreshing, fromCache, error, refresh } = usePrices();
  const [q, setQ] = useState('');
  const [level, setLevel] = useState<FamaLevel>('Ladang');

  const fama = useMemo<FamaItem[]>(() => {
    // latest.json has national averages; per state/district use api/fama.json / fama_daerah.json
    const items = (data?.fama.items ?? []).filter((i) => i.level === level && i.state === null);
    const s = q.trim().toUpperCase();
    // Match at word start: "ayam" finds "AYAM HIDUP", not "BAYAM".
    return s ? items.filter((i) => (' ' + i.item.toUpperCase()).includes(' ' + s)) : items;
  }, [data, q, level]);

  if (loading && !data) {
    return <View style={styles.center}><ActivityIndicator color={C.brand} /></View>;
  }
  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.small}>{error ?? 'Tiada data.'}</Text>
        <Pressable onPress={refresh}><Text style={styles.link}>Cuba lagi</Text></Pressable>
      </View>
    );
  }

  const m = data.mpob;
  const header = (
    <View>
      {fromCache ? <Text style={styles.banner}>Luar talian — memaparkan data tersimpan.</Text> : null}
      <View style={styles.card}>
        <Text style={styles.h2}>Harga BTS Sawit (MPOB)</Text>
        <Text style={styles.small}>{m.unit}</Text>
        <SourceBar src={data.sources.mpob} />
        <View style={styles.grid}>
          {(Object.keys(REGION_NAMES) as Region[]).map((r) => {
            const c = m.change?.[r];
            return (
              <View key={r} style={styles.cell}>
                <Text style={styles.small}>{REGION_NAMES[r]}</Text>
                <Text style={styles.big}>{m.prices?.[r]?.toFixed(2) ?? '—'}</Text>
                {c ? (
                  <Text style={{ color: c > 0 ? C.brand : C.down, fontSize: 12 }}>
                    {c > 0 ? '▲' : '▼'}{Math.abs(c).toFixed(2)}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>
      <View style={[styles.card, styles.cardTop]}>
        <Text style={styles.h2}>Harga Pasaran (FAMA)</Text>
        <SourceBar src={data.sources.fama} />
        <View style={styles.seg}>
          {LEVELS.map((l) => (
            <Pressable key={l} onPress={() => setLevel(l)} style={[styles.segBtn, l === level && styles.segOn]}
              accessibilityRole="button" accessibilityState={{ selected: l === level }}>
              <Text style={[styles.segText, l === level && { color: C.brand }]}>{l}</Text>
            </Pressable>
          ))}
        </View>
        {data.fama.window ? (
          <Text style={styles.small}>
            Purata {data.fama.window.days} hari ({fmtDate(data.fama.window.from)} – {fmtDate(data.fama.window.to)}), seluruh Malaysia
          </Text>
        ) : null}
        <TextInput
          style={styles.input} value={q} onChangeText={setQ}
          placeholder="Cari barang… (cth. ayam)" placeholderTextColor={C.muted}
          autoCorrect={false} clearButtonMode="while-editing"
        />
      </View>
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 16 }}
      data={fama}
      keyExtractor={(i) => `${i.level}|${i.item}|${i.grade}|${i.unit}`}
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <View style={styles.item}>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemName}>{item.item}</Text>
            <Text style={styles.small}>{[item.grade, item.unit, `${item.records} rekod`].filter(Boolean).join(' · ')}</Text>
          </View>
          <Text style={styles.price}>{fmtRM(item.price)}</Text>
        </View>
      )}
      ListEmptyComponent={<Text style={[styles.small, styles.item]}>Tiada padanan.</Text>}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.brand} />}
      keyboardShouldPersistTaps="handled"
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  banner: { backgroundColor: C.warnBg, color: C.warnInk, padding: 8, borderRadius: 8, marginBottom: 12, textAlign: 'center' },
  card: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 14 },
  cardTop: { marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  h2: { fontSize: 17, fontWeight: '700', color: C.text },
  small: { fontSize: 13, color: C.muted, marginTop: 2 },
  src: { backgroundColor: '#f1f4f2', borderRadius: 10, padding: 10, marginVertical: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  pill: { fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  pillOk: { backgroundColor: C.okBg },
  pillWarn: { backgroundColor: C.warnBg },
  link: { color: C.brand, fontWeight: '600', fontSize: 14 },
  seg: { flexDirection: 'row', backgroundColor: '#f1f4f2', borderRadius: 12, padding: 4, gap: 4, marginVertical: 6 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segOn: { backgroundColor: C.card },
  segText: { fontWeight: '600', color: C.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  cell: { width: '48.5%', backgroundColor: '#f1f4f2', borderRadius: 10, padding: 10 },
  big: { fontSize: 22, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'] },
  input: { backgroundColor: '#f1f4f2', borderRadius: 10, padding: 10, marginTop: 6, color: C.text, fontSize: 16 },
  item: {
    flexDirection: 'row', gap: 12, paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
  },
  itemName: { fontSize: 15, fontWeight: '600', color: C.text },
  price: { fontSize: 16, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'] },
});
