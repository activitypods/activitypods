const { arrayOf } = require('@semapps/ldp');

// Return true if all elements of a1 can be found on a2. Order does not matter.
const arraysEqual = (a1, a2) =>
  arrayOf(a1).length === arrayOf(a2).length && arrayOf(a1).every(i => arrayOf(a2).includes(i));

const matchTemplateObj = (obj, template) => {
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
const hasActivityGrant = (capabilityPresentation, templateActivity) => {
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
    const activityMatchesGrant = matchTemplateObj(activity, grant.activity);
    return activityMatchesGrant;
  });
};

module.exports = {
  arraysEqual,
  hasActivityGrant
};
