/** The prep board, read from the open note's keywords. */
import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import {PluginCommAPI, PluginManager} from 'sn-plugin-lib';
import {ensureRead, ensureWrite} from '../permissions';
import {
  addDayEvent,
  addTask,
  Board,
  bucket,
  Bucket,
  currentPage,
  EntryType,
  findSessionKeyword,
  isNotAllowed,
  loadBoard,
  removeDayEvent,
  rewriteTask,
  setDay,
  setSession,
  Task,
  TYPE_META,
} from '../tasks';

/**
 * Two views over the same keywords:
 *  - 'tonight': the session board for every type except Task. Strong start,
 *    Next up, always-on split into one sub-tab per type, overdue.
 *  - 'ledger' (Back Burner): the DM's to-do list, Task entries only, with
 *    overdue, next up, upcoming, someday and done.
 */
export type BoardMode = 'tonight' | 'ledger';
const TONIGHT_ORDER: Bucket[] = ['strongNow', 'due', 'always', 'overdue'];
import {Button, Row, styles} from '../ui';

const ORDER: Bucket[] = ['strongNow', 'overdue', 'due', 'always', 'upcoming', 'someday', 'done'];
const TITLES: Record<Bucket, string> = {
  strongNow: 'Strong start',
  overdue: 'Overdue',
  due: 'Next up',
  always: 'Always on',
  upcoming: 'Upcoming',
  someday: 'Someday',
  done: 'Done',
};

function byTypeThenDue(a: Task, b: Task): number {
  return TYPE_META[a.type].order - TYPE_META[b.type].order || (a.due ?? 1e9) - (b.due ?? 1e9) || a.page - b.page;
}

export function BackBurnerScreen({mode = 'ledger'}: {mode?: BoardMode}): React.JSX.Element {
  const [board, setBoard] = useState<Board | null>(null);
  const [alwaysTab, setAlwaysTab] = useState<EntryType | null>(null);
  // calendar
  const [calStart, setCalStart] = useState<number | null>(null); // first day shown; null = follow today
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [eventText, setEventText] = useState('');
  // quick task
  const [quickText, setQuickText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await ensureRead();
      setBoard(await loadBoard());
    } catch (e) {
      setError(
        isNotAllowed(e)
          ? `${String((e as Error)?.message ?? e)}\nThe app hosting the plugin does not offer this call. Open your campaign note and try again.`
          : String((e as Error)?.message ?? e),
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const withWrite = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await ensureWrite();
      await fn();
      setBoard(await loadBoard());
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, []);

  const bumpSession = (delta: number) =>
    withWrite(async () => {
      if (!board) {
        return;
      }
      const loc = await findSessionKeyword(board.path);
      await setSession(board.path, loc, Math.max(1, board.session + delta));
    });

  const go = async (task: Task) => {
    try {
      await PluginCommAPI.jumpToPage(task.page);
      await PluginManager.closePluginView();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  };

  const groups: Partial<Record<Bucket, Task[]>> = {};
  const visible = (t: Task) => (mode === 'ledger' ? t.type === 'task' : t.type !== 'task');
  if (board) {
    for (const t of board.tasks.filter(visible)) {
      (groups[bucket(t, board.session)] ??= []).push(t);
    }
    for (const list of Object.values(groups)) {
      list.sort(byTypeThenDue);
    }
  }

  const renderTask = (t: Task, b: Bucket) => {
    const dated = TYPE_META[t.type].dated;
    const path = board!.path;
    return (
      <View key={`${t.page}-${t.index}`} style={{borderBottomWidth: 1, borderBottomColor: '#000', paddingVertical: 8}}>
        <View style={{flexDirection: 'row', alignItems: 'flex-start'}}>
          <View style={{borderWidth: 2, borderColor: '#000', minWidth: 36, paddingHorizontal: 6, paddingVertical: 2, marginRight: 10, alignItems: 'center'}}>
            <Text style={{fontSize: 20, color: '#000'}}>{TYPE_META[t.type].glyph}</Text>
          </View>
          <Text style={[styles.body, {flex: 1}, t.done && {textDecorationLine: 'line-through'}]}>
            {b !== 'always' && b !== 'strongNow' ? `${TYPE_META[t.type].label}: ` : ''}
            {t.text}
          </Text>
        </View>
        <Row>
          <Text style={[styles.muted, {marginRight: 12}]}>
            {dated ? (t.due === null ? 'someday' : `S${t.due}`) : TYPE_META[t.type].label} · p.{t.page + 1}
          </Text>
          <Button
            small
            label={t.done ? 'Undo' : dated ? 'Done' : 'Retire'}
            disabled={busy}
            onPress={() => withWrite(() => rewriteTask(path, t, {done: !t.done}))}
          />
          {dated && !t.done && (
            <Button small label="Push +1" disabled={busy} onPress={() => withWrite(() => rewriteTask(path, t, {due: (t.due ?? board!.session) + 1}))} />
          )}
          <Button small label="Go to page" disabled={busy} onPress={() => go(t)} />
        </Row>
      </View>
    );
  };

  const order = mode === 'tonight' ? TONIGHT_ORDER : ORDER;
  const alwaysTypes = Array.from(new Set((groups.always ?? []).map(t => t.type))).sort(
    (a, b) => TYPE_META[a].order - TYPE_META[b].order,
  );
  const activeAlways = alwaysTab && alwaysTypes.includes(alwaysTab) ? alwaysTab : alwaysTypes[0] ?? null;

  return (
    <ScrollView style={styles.screen}>
      <Row>
        <Text style={styles.h1}>{mode === 'tonight' ? 'Tonight · session' : 'DM to-do · session'} {board?.session ?? '…'}</Text>
        <View style={{width: 16}} />
        <Button small label="−" disabled={busy || !board} onPress={() => bumpSession(-1)} />
        <Button small label="+" disabled={busy || !board} onPress={() => bumpSession(1)} />
        <View style={{width: 16}} />
        <Button small label="Refresh" disabled={busy} onPress={refresh} />
      </Row>
      {board && (
        <Text style={styles.muted}>
          {board.tasks.filter(visible).length} entries · {board.path.split('/').pop()}
          {mode === 'tonight'
            ? ' · ' + (['strong', 'scene', 'plot', 'quest', 'hero', 'npc', 'location', 'lore', 'treasure'] as EntryType[]).map(t => `${TYPE_META[t].glyph} ${TYPE_META[t].label}`).join('  ')
            : ''}
        </Text>
      )}
      {error && (
        <Text style={styles.error} selectable>
          {error}
        </Text>
      )}
      {mode === 'ledger' && board && (
        <View style={{borderWidth: 3, borderColor: '#000', padding: 10, marginTop: 12}}>
          <Text style={styles.h2}>New DM task</Text>
          <TextInput
            value={quickText}
            onChangeText={setQuickText}
            placeholder="e.g. Print the harbour map"
            placeholderTextColor="#000"
            style={{borderWidth: 2, borderColor: '#000', padding: 8, fontSize: 20, color: '#000', marginVertical: 8}}
          />
          <Row>
            {[
              {label: `This session (S${board.session})`, due: board.session},
              {label: `Next (S${board.session + 1})`, due: board.session + 1},
              {label: 'Someday', due: null as number | null},
            ].map(o => (
              <Button
                small
                key={o.label}
                label={o.label}
                disabled={busy || !quickText.trim()}
                onPress={() =>
                  withWrite(async () => {
                    await addTask(board.path, await currentPage(), 'task', quickText, o.due);
                    setQuickText('');
                  })
                }
              />
            ))}
          </Row>
          <Text style={styles.muted}>Saved as a keyword on the page you have open.</Text>
        </View>
      )}
      {board && board.tasks.filter(visible).length === 0 && (
        <Text style={[styles.body, {marginTop: 16}]}>
          {mode === 'ledger'
            ? 'No DM tasks. Lasso a to-do and capture it as "Task".'
            : 'Nothing for tonight yet. Handwrite something, lasso it, tap Capture.'}
        </Text>
      )}

      {board && mode === 'tonight' && !(groups.strongNow?.length) && (
        <View style={{borderWidth: 3, borderColor: '#000', padding: 12, marginTop: 12}}>
          <Text style={styles.h2}>Strong start</Text>
          <Text style={styles.body}>No strong start for session {board.session} yet. Capture one as "Strong start".</Text>
        </View>
      )}

      {order.map(key => {
        const list = groups[key] ?? [];
        if (list.length === 0) {
          return null;
        }
        if (key === 'always' && mode === 'tonight') {
          const shown = list.filter(t => t.type === activeAlways);
          return (
            <View key={key}>
              <Text style={styles.h2}>Always on</Text>
              <Row>
                {alwaysTypes.map(t => (
                  <Button
                    small
                    key={t}
                    label={`${TYPE_META[t].plural} (${list.filter(x => x.type === t).length})`}
                    disabled={busy}
                    onPress={() => setAlwaysTab(t)}
                  />
                ))}
              </Row>
              <Text style={[styles.muted, {marginTop: 6}]}>
                showing {activeAlways ? TYPE_META[activeAlways].plural : ''}
              </Text>
              {shown.map(t => renderTask(t, key))}
            </View>
          );
        }
        if (key === 'done' && !showDone) {
          return (
            <View key={key}>
              <Text style={styles.h2}>
                {TITLES[key]} ({list.length})
              </Text>
              <Button small label="Show done" onPress={() => setShowDone(true)} />
            </View>
          );
        }
        const boxed = key === 'strongNow';
        return (
          <View key={key} style={boxed ? {borderWidth: 3, borderColor: '#000', padding: 12, marginTop: 12} : undefined}>
            <Text style={styles.h2}>
              {TITLES[key]} ({list.length})
            </Text>
            {list.map(t => renderTask(t, key))}
          </View>
        );
      })}
      {mode === 'tonight' && board && (() => {
        const first = calStart ?? Math.max(1, board.day - 6);
        const days = Array.from({length: 14}, (_, i) => first + i);
        const byDay = new Map<number, typeof board.events>();
        for (const ev of board.events) {
          (byDay.get(ev.day) ?? byDay.set(ev.day, []).get(ev.day)!).push(ev);
        }
        const outside = board.events.filter(ev => ev.day < first || ev.day > first + 13);
        return (
          <View style={{marginTop: 24, borderTopWidth: 3, borderTopColor: '#000', paddingTop: 12}}>
            <Row>
              <Text style={styles.h2}>In-game day {board.day}</Text>
              <Text style={[styles.muted, {marginLeft: 10, marginRight: 16}]}>days since arrival</Text>
              <Button small label="◀ week" disabled={busy || first <= 1} onPress={() => setCalStart(Math.max(1, first - 7))} />
              <Button small label="week ▶" disabled={busy} onPress={() => setCalStart(first + 7)} />
              <Button small label="today" disabled={busy || calStart === null} onPress={() => setCalStart(null)} />
            </Row>
            <View style={{flexDirection: 'row', flexWrap: 'wrap', marginVertical: 8}}>
              {days.map(d => {
                const now = d === board.day;
                const sel = d === selectedDay;
                const evs = byDay.get(d) ?? [];
                return (
                  <Pressable
                    key={d}
                    onPress={() => setSelectedDay(sel ? null : d)}
                    style={{
                      width: '14.28%',
                      minHeight: 110,
                      borderWidth: sel ? 4 : 2,
                      borderColor: '#000',
                      padding: 6,
                      backgroundColor: now ? '#000' : '#fff',
                    }}>
                    <Text style={{fontSize: 20, fontWeight: '700', color: now ? '#fff' : '#000'}}>{d}</Text>
                    {evs.map(ev => (
                      <Text key={ev.index} style={{fontSize: 14, color: now ? '#fff' : '#000', marginTop: 2}} numberOfLines={3}>
                        {ev.text}
                      </Text>
                    ))}
                  </Pressable>
                );
              })}
            </View>
            {selectedDay !== null && (
              <View style={{borderWidth: 3, borderColor: '#000', padding: 10, marginBottom: 8}}>
                <Text style={styles.h2}>Day {selectedDay}</Text>
                {(byDay.get(selectedDay) ?? []).map(ev => (
                  <Row key={ev.index}>
                    <Text style={[styles.body, {flex: 1}]}>{ev.text}</Text>
                    <Button small label="Remove" disabled={busy} onPress={() => withWrite(() => removeDayEvent(board.path, ev))} />
                  </Row>
                ))}
                <TextInput
                  value={eventText}
                  onChangeText={setEventText}
                  placeholder="event, e.g. Ireena wedding"
                  placeholderTextColor="#000"
                  style={{borderWidth: 2, borderColor: '#000', padding: 8, fontSize: 20, color: '#000', marginVertical: 8}}
                />
                <Row>
                  <Button
                    small
                    label="Add event"
                    disabled={busy || !eventText.trim()}
                    onPress={() =>
                      withWrite(async () => {
                        await addDayEvent(board.path, selectedDay, eventText);
                        setEventText('');
                      })
                    }
                  />
                  <Button small label="Make this today" disabled={busy || selectedDay === board.day} onPress={() => withWrite(() => setDay(board.path, selectedDay))} />
                </Row>
              </View>
            )}
            <Row>
              <Button small label="← Back a day" disabled={busy || board.day <= 1} onPress={() => withWrite(() => setDay(board.path, board.day - 1))} />
              <Button small label="Next day →" disabled={busy} onPress={() => withWrite(() => setDay(board.path, board.day + 1))} />
              <Button small label="+7 days" disabled={busy} onPress={() => withWrite(() => setDay(board.path, board.day + 7))} />
            </Row>
            {outside.length > 0 && (
              <View style={{marginTop: 8}}>
                <Text style={styles.muted}>Other events</Text>
                {outside.map(ev => (
                  <Row key={`${ev.page}-${ev.index}`}>
                    <Text style={[styles.body, {flex: 1}]}>
                      Day {ev.day}: {ev.text}
                    </Text>
                    <Button small label="Show" disabled={busy} onPress={() => { setCalStart(Math.max(1, ev.day - 6)); setSelectedDay(ev.day); }} />
                  </Row>
                ))}
              </View>
            )}
          </View>
        );
      })()}
      <View style={{height: 80}} />
    </ScrollView>
  );
}
