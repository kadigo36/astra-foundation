const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../Code.gs'), 'utf8');
const headers = ['Detected at', 'Account ID', 'Account type', 'Provider', 'Title', 'Metadata', 'External ID', 'Source date', 'Open'];

function harness() {
  const state = new Map([['ASTRA_EVENTS_SPREADSHEET_ID', 'existing'], ['ASTRA_SEEN_GMAIL', '["old"]']]);
  const rows = [headers.slice()];
  const calls = [];
  const faults = {};
  const sheet = {
    getLastRow: () => rows.length,
    getRange(row, column, height, width) {
      return {
        getValues: () => rows.slice(row - 1, row - 1 + height).map(r => r.slice(column - 1, column - 1 + width)),
        setValues(values) {
          calls.push('append');
          if (faults.append) throw Error('append failed');
          values.forEach((r, i) => { rows[row - 1 + i] = r.slice(); });
        }
      };
    }
  };
  const context = vm.createContext({
    Logger: { log() {} }, console: { error() {}, warn() {} },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => state.has(key) ? state.get(key) : null,
      setProperty(key, value) {
        calls.push('ack');
        if (faults.ack) throw Error('property write failed');
        state.set(key, value);
      }
    }) },
    SpreadsheetApp: {
      openById(id) { calls.push('open'); if (faults.open) throw Error('unavailable'); return { getSheetByName: () => sheet }; },
      create() { calls.push('create'); throw Error('unexpected replacement'); },
      flush() { calls.push('flush'); if (faults.flush) throw Error('flush failed'); }
    },
    LockService: { getScriptLock: () => ({ tryLock: () => !faults.lock, releaseLock() { calls.push('unlock'); } }) }
  });
  vm.runInContext(source, context);
  return { state, rows, calls, faults, context, run: (items = [{ id: 'new', title: 'test' }]) => context.recordNewItems_('gmail', items) };
}

test('acknowledges only after append and flush, preserving old IDs', () => {
  const h = harness(); h.run();
  assert.deepEqual(h.calls, ['open', 'append', 'flush', 'ack']);
  assert.deepEqual(JSON.parse(h.state.get('ASTRA_SEEN_GMAIL')), ['old', 'new']);
});
test('append failure leaves seen state unchanged', () => {
  const h = harness(); h.faults.append = true;
  assert.throws(() => h.run(), /append failed/);
  assert.equal(h.state.get('ASTRA_SEEN_GMAIL'), '["old"]');
  assert.equal(h.rows.length, 1);
});
test('flush failure leaves seen state unchanged and retry does not duplicate', () => {
  const h = harness(); h.faults.flush = true;
  assert.throws(() => h.run(), /flush failed/);
  assert.equal(h.state.get('ASTRA_SEEN_GMAIL'), '["old"]');
  h.faults.flush = false; h.run(); assert.equal(h.rows.length, 2);
});
test('property failure after persistence can be retried without another row', () => {
  const h = harness(); h.faults.ack = true;
  assert.throws(() => h.run(), /property write failed/);
  h.faults.ack = false;
  assert.equal(h.run().newEvents, 0);
  assert.equal(h.run().newEvents, 0);
  assert.equal(h.rows.length, 2);
});
test('persisted identity is scoped to account and provider', () => {
  const h = harness();
  h.rows.push(['', 'another-account', 'personal', 'gmail', '', '', 'new', '', '']);
  h.rows.push(['', 'account-1', 'personal', 'drive', '', '', 'new', '', '']);
  h.run(); assert.equal(h.rows.length, 4);
});
test('duplicate IDs inside one provider response append once', () => {
  const h = harness(); assert.equal(h.run([{ id: 'new' }, { id: 'new' }]).newEvents, 1);
  assert.equal(h.rows.length, 2);
});
test('unavailable configured sheet is not replaced and its ID is preserved', () => {
  const h = harness(); h.faults.open = true;
  assert.throws(() => h.run(), /unavailable/);
  assert.equal(h.state.get('ASTRA_EVENTS_SPREADSHEET_ID'), 'existing');
  assert.equal(h.state.get('ASTRA_SEEN_GMAIL'), '["old"]');
  assert.ok(!h.calls.includes('create'));
});
test('incompatible live-school layout fails without writes', () => {
  const h = harness(); h.rows[0] = ['Detected at', 'Provider', 'Title', 'Metadata', 'External ID', 'Source date', 'Open', 'Event key', 'Change type'];
  assert.throws(() => h.run(), /Incompatible Events schema/);
  assert.equal(h.state.get('ASTRA_SEEN_GMAIL'), '["old"]');
  assert.equal(h.rows.length, 1);
});
test('malformed seen state is preserved for recovery', () => {
  for (const value of ['{', '{}', '[1]']) {
    const h = harness(); h.state.set('ASTRA_SEEN_GMAIL', value);
    assert.throws(() => h.run());
    assert.equal(h.state.get('ASTRA_SEEN_GMAIL'), value);
    assert.equal(h.rows.length, 1);
  }
});
test('initial baseline emits no historical events', () => {
  const h = harness(); h.state.delete('ASTRA_SEEN_GMAIL');
  assert.equal(h.run().baseline, true);
  assert.equal(h.rows.length, 1);
});
test('overlapping monitoring cycle skips before touching storage', () => {
  const h = harness(); h.faults.lock = true; h.context.runMonitoringCycle();
  assert.deepEqual(h.calls, []);
});
test('monitoring lock is released when storage access fails', () => {
  const h = harness(); h.faults.open = true;
  assert.throws(() => h.context.runMonitoringCycle(), /unavailable/);
  assert.deepEqual(h.calls, ['open', 'unlock']);
});
