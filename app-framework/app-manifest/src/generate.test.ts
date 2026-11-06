import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { generateDocuments } from './generate.ts';
import { addNeed, parseManifest, removeNeed, SPECIAL_RIGHTS, type AppManifest } from './manifest.ts';

const NOTE = 'https://shapes.activitypods.org/shapetrees/as/Note';
const PROFILE = 'https://shapes.activitypods.org/shapetrees/as/Profile';
const BASE_URL = 'https://app.example/';

const manifest: AppManifest = {
  name: 'Example',
  description: { en: 'An example', fr: 'Un exemple' },
  accessNeeds: {
    required: [
      { shapeTreeUri: NOTE, accessMode: ['acl:Read', 'acl:Write'] },
      { shapeTreeUri: PROFILE, accessMode: 'acl:Read' },
      'apods:ReadInbox'
    ]
  }
};

const groups = (documents: Record<string, any>) => documents['app.json']['interop:hasAccessNeedGroup'];

test('the client ID document is the one the Pod provider expects', () => {
  const app: any = generateDocuments(manifest, BASE_URL)['app.json'];
  assert.equal(app.client_id, 'https://app.example/app.json');
  assert.ok(app['@context'].includes('https://www.w3.org/ns/solid/oidc-context.jsonld'));
  assert.deepEqual(app.redirect_uris, ['https://app.example/login']);
  assert.equal(app['interop:hasAuthorizationCallbackEndpoint'], 'https://app.example/login?register_app=true');
  assert.equal(app.inbox, undefined);
});

test('the groups link to documents that are generated', () => {
  const documents: Record<string, any> = generateDocuments(manifest, BASE_URL);
  assert.equal(groups(documents).length, 1);
  const group = documents[groups(documents)[0].replace(BASE_URL, '')];
  assert.equal(group['interop:accessNecessity'], 'interop:AccessRequired');
  assert.deepEqual(group['apods:hasSpecialRights'], ['apods:ReadInbox']);
  assert.equal(group['interop:hasAccessNeed'].length, 2);
  for (const uri of group['interop:hasAccessNeed']) {
    assert.equal(documents[uri.replace(BASE_URL, '')]['interop:accessNecessity'], 'interop:AccessRequired');
  }
});

test('no group is generated for an empty necessity', () => {
  const documents = generateDocuments({ ...manifest, accessNeeds: { required: [], optional: [] } }, BASE_URL);
  assert.deepEqual(Object.keys(documents), ['app.json']);
});

test('changing an access need changes the URI of the group', () => {
  const changed = addNeed(manifest, { shapeTreeUri: NOTE, accessMode: 'acl:Read' }, 'required');
  assert.notDeepEqual(groups(generateDocuments(changed, BASE_URL)), groups(generateDocuments(manifest, BASE_URL)));
});

test('changing a special right changes the URI of the group', () => {
  const changed = addNeed(manifest, 'apods:PostOutbox', 'required');
  assert.notDeepEqual(groups(generateDocuments(changed, BASE_URL)), groups(generateDocuments(manifest, BASE_URL)));
});

test('an unchanged access need keeps its URI when another one is removed', () => {
  const before = Object.keys(generateDocuments(manifest, BASE_URL));
  const after = Object.keys(generateDocuments(removeNeed(manifest, NOTE), BASE_URL));
  assert.equal(after.filter(path => path.includes('need-') && before.includes(path)).length, 1);
});

test('the order of the access needs does not change the URIs', () => {
  const reordered = {
    ...manifest,
    accessNeeds: { required: [...manifest.accessNeeds.required!].reverse() }
  };
  assert.deepEqual(groups(generateDocuments(reordered, BASE_URL)), groups(generateDocuments(manifest, BASE_URL)));
});

test('the file names do not depend on the URL of the app', () => {
  assert.deepEqual(
    Object.keys(generateDocuments(manifest, 'http://localhost:5173/')),
    Object.keys(generateDocuments(manifest, BASE_URL))
  );
});

test('adding an existing access need replaces it', () => {
  const updated = addNeed(manifest, { shapeTreeUri: NOTE, accessMode: 'acl:Read' }, 'optional');
  assert.equal(updated.accessNeeds.required!.length, 2);
  assert.deepEqual(updated.accessNeeds.optional, [{ shapeTreeUri: NOTE, accessMode: 'acl:Read' }]);
});

test('invalid manifests are rejected', () => {
  assert.throws(() => parseManifest('{"description":"x"}'), /"name"/);
  assert.throws(
    () => parseManifest('{"name":"x","description":"x","accessNeeds":{"required":["apods:Nope"]}}'),
    /Nope/
  );
  assert.throws(
    () =>
      parseManifest(
        '{"name":"x","description":"x","accessNeeds":{"required":[{"shapeTreeUri":"https://a.b/c","accessMode":"read"}]}}'
      ),
    /accessMode/
  );
});

test('the JSON schema lists the same special rights', () => {
  const schema = JSON.parse(readFileSync(new URL('../schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(schema.definitions.accessNeeds.items.oneOf[0].enum, Object.keys(SPECIAL_RIGHTS));
});
