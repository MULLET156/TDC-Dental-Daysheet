'use strict';
// Test helpers: a fake Open Dental gateway with invented patients, and a way to
// call the module the way the Dashboard does (signed). Fake data only.
const http = require('node:http');
const crypto = require('node:crypto');
const { tdcSignature } = require('../lib/tdc-verify');
const { createApp } = require('../lib/app');
const { createData } = require('../lib/data');

const SECRET = crypto.randomBytes(32).toString('hex');
const TODAY = '2026-11-16';
const KEY = 'odg_test_key_for_unit_tests_0001';

// Invented people only. Hygiene codes never appear in unscheduled rows (the gateway leaves them out).
function fakeRows(name, params) {
  const d = params.date || TODAY;
  switch (name) {
    case 'daysheet':
      return [
        { AptNum: 501, AptDateTime: `${d} 08:00:00`, Time: '08:00', Minutes: 60, Status: 'Complete', PatNum: 9001, LName: 'Testerson', FName: 'Alex', Preferred: '', Provider: 'DOC1', Hygienist: 'HYG1', OpName: 'Hyg 1', IsHygiene: true, IsNewPatient: false, Confirmed: 'Confirmed', Procedures: 'D1110, D0120' },
        { AptNum: 502, AptDateTime: `${d} 09:30:00`, Time: '09:30', Minutes: 90, Status: 'Scheduled', PatNum: 9002, LName: 'Sampleton', FName: 'Bea', Preferred: 'B', Provider: 'DOC1', Hygienist: null, OpName: 'Op 1', IsHygiene: false, IsNewPatient: false, Confirmed: 'Texted', Procedures: 'D2740 #30' },
        { AptNum: 503, AptDateTime: `${d} 13:00:00`, Time: '13:00', Minutes: 60, Status: 'Scheduled', PatNum: 9003, LName: 'Mockford', FName: 'Cy', Preferred: '', Provider: 'DOC2', Hygienist: null, OpName: 'Op 2', IsHygiene: false, IsNewPatient: true, Confirmed: 'Unconfirmed', Procedures: 'D0150, D0210' },
        ...(params.include_broken === 'true' ? [{ AptNum: 504, AptDateTime: `${d} 15:00:00`, Time: '15:00', Minutes: 30, Status: 'Broken', PatNum: 9004, LName: 'Fakely', FName: 'Dee', Preferred: '', Provider: 'DOC1', Hygienist: null, OpName: 'Op 1', IsHygiene: false, IsNewPatient: false, Confirmed: '', Procedures: 'D2391' }] : []),
      ];
    case 'xray_history':
      return [
        { PatNum: 9001, LName: 'Testerson', FName: 'Alex', Category: 'BWX', LastDate: '2025-10-01', Limit: '1 per 12 months', NextCovered: '2026-10-01', CoveredNow: true, AsOf: TODAY },
        { PatNum: 9001, LName: 'Testerson', FName: 'Alex', Category: 'FMX', LastDate: '2024-01-05', Limit: '1 per 5 years', NextCovered: '2029-01-05', CoveredNow: false, AsOf: TODAY },
        { PatNum: 9002, LName: 'Sampleton', FName: 'Bea', Category: 'BWX', LastDate: null, Limit: null, NextCovered: null, CoveredNow: null, AsOf: TODAY },
        { PatNum: 9003, LName: 'Mockford', FName: 'Cy', Category: 'PANO', LastDate: '2021-11-16', Limit: '1 per 5 years', NextCovered: TODAY, CoveredNow: true, AsOf: TODAY },
      ].filter((r) => !params.patients || params.patients.map(Number).includes(r.PatNum));
    case 'unscheduled_treatment': {
      const all = [
        { PatNum: 9002, LName: 'Sampleton', FName: 'Bea', ProcNum: 7001, ProcCode: 'D2950', Descript: 'core buildup', ToothNum: '30', Surf: '', Fee: 320, DateTP: '2025-09-01', Priority: 'Urgent', PatientTotal: 1520, PatientOldestDateTP: '2025-09-01', AsOf: TODAY },
        { PatNum: 9002, LName: 'Sampleton', FName: 'Bea', ProcNum: 7002, ProcCode: 'D2740', Descript: 'crown - porcelain/ceramic', ToothNum: '19', Surf: '', Fee: 1200, DateTP: '2026-10-01', Priority: '', PatientTotal: 1520, PatientOldestDateTP: '2025-09-01', AsOf: TODAY },
        { PatNum: 9005, LName: 'Exampleby', FName: 'Eli', ProcNum: 7003, ProcCode: 'D2392', Descript: 'resin - two surfaces', ToothNum: '3', Surf: 'MO', Fee: 240, DateTP: '2026-06-01', Priority: '', PatientTotal: 240, PatientOldestDateTP: '2026-06-01', AsOf: TODAY },
      ];
      return all.filter((r) => !params.patients || params.patients.map(Number).includes(r.PatNum));
    }
    case 'lab_cases_open':
      return [
        { LabCaseNum: 801, PatNum: 9002, LName: 'Sampleton', FName: 'Bea', Lab: 'Pretend Lab', ProvNum: 1, DateTimeCreated: '2026-11-01 10:00:00', DateTimeSent: '2026-11-02 10:00:00', DateTimeDue: '2026-11-15 12:00:00', DateTimeRecd: '0001-01-01 00:00:00', AptNum: 502, SeatAppt: `${TODAY} 09:30:00`, AptStatus: 1, Status: 'at_lab', Overdue: 1, SeatRisk: 1, Instructions: 'Shade A2 (fake)' },
        { LabCaseNum: 802, PatNum: 9006, LName: 'Placeholder', FName: 'Flo', Lab: 'In-house mill', ProvNum: 1, DateTimeCreated: '2026-11-10 10:00:00', DateTimeSent: '0001-01-01 00:00:00', DateTimeDue: '2026-11-19 12:00:00', DateTimeRecd: '0001-01-01 00:00:00', AptNum: 610, SeatAppt: '2026-11-20 10:00:00', AptStatus: 1, Status: 'not_sent', Overdue: 0, SeatRisk: 1, Instructions: '' },
        { LabCaseNum: 803, PatNum: 9007, LName: 'Dummer', FName: 'Gus', Lab: 'Pretend Lab', ProvNum: 1, DateTimeCreated: '2026-11-01 10:00:00', DateTimeSent: '2026-11-02 10:00:00', DateTimeDue: '2026-11-12 12:00:00', DateTimeRecd: '2026-11-12 09:00:00', AptNum: 611, SeatAppt: '2026-11-18 10:00:00', AptStatus: 1, Status: 'received_not_checked', Overdue: 0, SeatRisk: 0, Instructions: '' },
      ];
    default:
      return null;
  }
}

function startFakeGateway({ stage = 'design', fake = true } = {}) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://gw');
      const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (url.pathname === '/health') return send(200, { ok: true, version: '0.13.0', stage: server.stage, fake });
      if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: { message: 'bad key' } });
      const m = url.pathname.match(/^\/v1\/reports\/([a-z0-9_]+)$/);
      if (!m) return send(403, { error: { message: 'not allowed' } });
      const params = (body && JSON.parse(body).params) || {};
      calls.push({ report: m[1], params });
      const rows = fakeRows(m[1], params);
      if (!rows) return send(403, { error: { message: 'not allowed for this key' } });
      return send(200, { report: m[1], count: rows.length, truncated: false, rows });
    });
  });
  server.stage = stage;
  server.calls = calls;
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function startModule({ gateway, gatewayUrl, stage = 'design', today = TODAY } = {}) {
  const logs = [];
  const url = gatewayUrl || `http://127.0.0.1:${gateway.address().port}`;
  const data = createData({ gatewayUrl: url, gatewayKey: KEY, stage });
  const app = createApp({ secret: SECRET, stage, data, log: (o) => logs.push(JSON.stringify(o)), today: () => today });
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  return { app, data, logs, port: app.address().port };
}

function call(port, method, pathAndQuery, { user = 'jtester', name = 'Jo Tester', roles = 'front', base = '/m/daysheet', sign = true, time = Date.now() } = {}) {
  const headers = {};
  if (sign) {
    headers['x-tdc-user'] = user; headers['x-tdc-name'] = name; headers['x-tdc-roles'] = roles; headers['x-tdc-base'] = base;
    headers['x-tdc-time'] = String(time);
    headers['x-tdc-sig'] = tdcSignature(SECRET, String(time), method, pathAndQuery, user, roles, base);
  }
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: pathAndQuery, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { /* html */ } resolve({ status: res.statusCode, headers: res.headers, text, json }); });
    });
    req.on('error', reject);
    req.end();
  });
}

const close = (s) => new Promise((r) => s.close(r));

module.exports = { SECRET, TODAY, KEY, startFakeGateway, startModule, call, close };
