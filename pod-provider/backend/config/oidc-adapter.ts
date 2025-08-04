// @ts-expect-error TS(7016): Could not find a declaration file for module 'node... Remove this comment to see the full error message
import fetch from 'node-fetch';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'loda... Remove this comment to see the full error message
import isEmpty from 'lodash/isEmpty.js';

const grantable = new Set([
  'AccessToken',
  'AuthorizationCode',
  'RefreshToken',
  'DeviceCode',
  'BackchannelAuthenticationRequest'
]);

const consumable = new Set(['AuthorizationCode', 'RefreshToken', 'DeviceCode', 'BackchannelAuthenticationRequest']);

function grantKeyFor(id: any) {
  return `grant:${id}`;
}

function userCodeKeyFor(userCode: any) {
  return `userCode:${userCode}`;
}

function uidKeyFor(uid: any) {
  return `uid:${uid}`;
}

class RedisAdapter {
  constructor(name: any, client: any) {
    // @ts-expect-error TS(2339): Property 'name' does not exist on type 'RedisAdapt... Remove this comment to see the full error message
    this.name = name;
    // @ts-expect-error TS(2339): Property 'client' does not exist on type 'RedisAda... Remove this comment to see the full error message
    this.client = client;
  }

  async upsert(id: any, payload: any, expiresIn: any) {
    const key = this.key(id);
    // @ts-expect-error TS(2339): Property 'name' does not exist on type 'RedisAdapt... Remove this comment to see the full error message
    const store = consumable.has(this.name) ? { payload: JSON.stringify(payload) } : JSON.stringify(payload);

    // @ts-expect-error TS(2339): Property 'client' does not exist on type 'RedisAda... Remove this comment to see the full error message
    const multi = this.client.multi();
    // @ts-expect-error TS(2339): Property 'name' does not exist on type 'RedisAdapt... Remove this comment to see the full error message
    multi[consumable.has(this.name) ? 'hmset' : 'set'](key, store);

    if (expiresIn) {
      multi.expire(key, expiresIn);
    }

    // @ts-expect-error TS(2339): Property 'name' does not exist on type 'RedisAdapt... Remove this comment to see the full error message
    if (grantable.has(this.name) && payload.grantId) {
      const grantKey = grantKeyFor(payload.grantId);
      multi.rpush(grantKey, key);
      // if you're seeing grant key lists growing out of acceptable proportions consider using LTRIM
      // here to trim the list to an appropriate length
      // @ts-expect-error TS(2339): Property 'client' does not exist on type 'RedisAda... Remove this comment to see the full error message
      const ttl = await this.client.ttl(grantKey);
      if (expiresIn > ttl) {
        multi.expire(grantKey, expiresIn);
      }
    }

    if (payload.userCode) {
      const userCodeKey = userCodeKeyFor(payload.userCode);
      multi.set(userCodeKey, id);
      multi.expire(userCodeKey, expiresIn);
    }

    if (payload.uid) {
      const uidKey = uidKeyFor(payload.uid);
      multi.set(uidKey, id);
      multi.expire(uidKey, expiresIn);
    }

    await multi.exec();
  }

  async find(id: any) {
    // @ts-expect-error TS(2339): Property 'name' does not exist on type 'RedisAdapt... Remove this comment to see the full error message
    const data = consumable.has(this.name)
      ? // @ts-expect-error TS(2339): Property 'client' does not exist on type 'RedisAda... Remove this comment to see the full error message
        await this.client.hgetall(this.key(id))
      : // @ts-expect-error TS(2339): Property 'client' does not exist on type 'RedisAda... Remove this comment to see the full error message
        await this.client.get(this.key(id));

    if (isEmpty(data)) {
      // @ts-expect-error TS(2339): Property 'name' does not exist on type 'RedisAdapt... Remove this comment to see the full error message
      if (this.name === 'Client' && id.startsWith('http')) {
        if (!/^https:|^http:\/\/localhost(?::\d+)?(?:\/|$)/u.test(id)) {
          throw new Error(`SSL is required for client_id authentication unless working locally.`);
        }
        const response = await fetch(id, {
          headers: {
            Accept: 'application/ld+json',
            JsonLdContext: 'https://www.w3.org/ns/solid/oidc-context.jsonld'
          }
        });
        if (response.status !== 200) {
          throw new Error(`Unable to access data at ${id}. Error ${response.status} ${await response.text()}`);
        }
        const data = await response.text();
        let json;
        try {
          json = JSON.parse(data);
          const contexts = Array.isArray(json['@context']) ? json['@context'] : [json['@context']];
          // We can only parse as simple JSON if the @context is correct
          if (!contexts.includes('https://www.w3.org/ns/solid/oidc-context.jsonld')) {
            throw new Error('Missing context https://www.w3.org/ns/solid/oidc-context.jsonld');
          }
        } catch (error) {
          json = undefined;
          // @ts-expect-error TS(18046): 'error' is of type 'unknown'.
          console.error(`Found unexpected client ID for ${id}: ${error.message}`);
        }

        if (json) {
          // Need to make sure the document is about the id
          if (json.client_id !== id) {
            throw new Error('The client registration `client_id` field must match the client ID');
          }
          // Reformat if necessary as the @container directive doesn't work
          if (json.redirect_uris['@none']) json.redirect_uris = json.redirect_uris['@none'];
          json = {
            client_id: json.client_id,
            redirect_uris: json.redirect_uris
          };
        } else {
          // Since the client ID does not match the default JSON-LD we try to interpret it as RDF
          // payload = await this.parseRdfClientId(data, id, response);
        }

        // `token_endpoint_auth_method: 'none'` prevents oidc-provider from requiring a client_secret
        // eslint-disable-next-line ts/naming-convention
        return { ...json, token_endpoint_auth_method: 'none' };
      } else {
        return undefined;
      }
    }

    if (typeof data === 'string') {
      return JSON.parse(data);
    }
    const { payload, ...rest } = data;
    return {
      ...rest,
      ...JSON.parse(payload)
    };
  }

  async findByUid(uid: any) {
    // @ts-expect-error TS(2339): Property 'client' does not exist on type 'RedisAda... Remove this comment to see the full error message
    const id = await this.client.get(uidKeyFor(uid));
    return this.find(id);
  }

  async findByUserCode(userCode: any) {
    // @ts-expect-error TS(2339): Property 'client' does not exist on type 'RedisAda... Remove this comment to see the full error message
    const id = await this.client.get(userCodeKeyFor(userCode));
    return this.find(id);
  }

  async destroy(id: any) {
    const key = this.key(id);
    // @ts-expect-error TS(2339): Property 'client' does not exist on type 'RedisAda... Remove this comment to see the full error message
    await this.client.del(key);
  }

  async revokeByGrantId(grantId: any) {
    // @ts-expect-error TS(2339): Property 'client' does not exist on type 'RedisAda... Remove this comment to see the full error message
    const multi = this.client.multi();
    // @ts-expect-error TS(2339): Property 'client' does not exist on type 'RedisAda... Remove this comment to see the full error message
    const tokens = await this.client.lrange(grantKeyFor(grantId), 0, -1);
    tokens.forEach((token: any) => multi.del(token));
    multi.del(grantKeyFor(grantId));
    await multi.exec();
  }

  async consume(id: any) {
    // @ts-expect-error TS(2339): Property 'client' does not exist on type 'RedisAda... Remove this comment to see the full error message
    await this.client.hset(this.key(id), 'consumed', Math.floor(Date.now() / 1000));
  }

  key(id: any) {
    // @ts-expect-error TS(2339): Property 'name' does not exist on type 'RedisAdapt... Remove this comment to see the full error message
    return `${this.name}:${id}`;
  }
}

export default RedisAdapter;
