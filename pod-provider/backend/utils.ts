import { arrayOf } from '@semapps/ldp';

// Return true if all elements of a1 can be found on a2. Order does not matter.
const arraysEqual = (a1: any, a2: any) =>
  arrayOf(a1).length === arrayOf(a2).length && arrayOf(a1).every(i => arrayOf(a2).includes(i));

const matchTemplateObj = (obj: any, template: any) => {
  if (typeof template !== 'object' && !Array.isArray(template)) {
    return obj === template;
  }

  const templateKeys = Object.keys(template);

  // Iterate through template object.
  for (const templateKey of templateKeys) {
    // Recurse, if the template property is an object or array.
    if (typeof template[templateKey] === 'object' || Array.isArray(template[templateKey])) {
      if (!matchTemplateObj(obj?.[templateKey], template[templateKey])) return false;
    } else if (template[templateKey] !== obj?.[templateKey]) {
      // If template property does not match object's property, return false;
      return false;
    }
  }

  return true;
};

/**
 * Validate that
 * - The activity has a capability with an ActivityGrant that matches the templateActivity.
 * - The activity matches the ActivityGrant.
 *
 * Matching means that the object needs to have all fields the template has as well, i.e. is a superset.
 */
const hasActivityGrant = (capabilityPresentation: any, templateActivity: any) => {
  const vcs = arrayOf(capabilityPresentation?.verifiableCredential);
  if (vcs.length === 0) return false;

  const lastCredentialSubject = vcs[vcs.length - 1].credentialSubject;
  if (!lastCredentialSubject || !lastCredentialSubject.hasActivityGrant) return false;

  // Check if one of the grants matches template activity and the provided activity.
  const grants = arrayOf(lastCredentialSubject.hasActivityGrant);
  return grants.some(grant => {
    if (!arrayOf(grant.type).includes('ActivityGrant')) return false;

    // Check if all fields in the templateActivity are included in the grant too.
    const grantMatchesTemplate = matchTemplateObj(grant.activity, templateActivity);
    if (!grantMatchesTemplate) return false;

    // Check if all fields in the grant are included in the activity too.
    // @ts-expect-error TS(2304): Cannot find name 'activity'.
    const activityMatchesGrant = matchTemplateObj(activity, grant.activity);
    return activityMatchesGrant;
  });
};

/**
 * Return a copy of the given vcard:hasGeo coordinates, randomly shifted by up to `radius` meters
 * (uniform distribution within the disc), so that the exact location cannot be inferred.
 */
const fuzzGeo = (geo: any, radius: number) => {
  const latitude = parseFloat(geo['vcard:latitude']);
  const longitude = parseFloat(geo['vcard:longitude']);

  const distance = radius * Math.sqrt(Math.random());
  const angle = 2 * Math.PI * Math.random();

  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos((latitude * Math.PI) / 180);

  return {
    'vcard:latitude': Number((latitude + (distance * Math.cos(angle)) / metersPerDegreeLat).toFixed(5)),
    'vcard:longitude': Number((longitude + (distance * Math.sin(angle)) / metersPerDegreeLng).toFixed(5))
  };
};

export { arraysEqual, hasActivityGrant, fuzzGeo };
