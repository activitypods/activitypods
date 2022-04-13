const { ControlledContainerMixin } = require('@semapps/ldp');
const { AnnouncerMixin } = require('@activitypods/announcer');
const { SynchronizerMixin } = require('@activitypods/synchronizer');

module.exports = {
  name: 'marketplace.request',
  mixins: [SynchronizerMixin, AnnouncerMixin, ControlledContainerMixin],
  settings: {
    path: '/requests',
    acceptedTypes: ['mp:Request', 'mp:PurchaseRequest', 'mp:RentRequest', 'mp:LoanRequest', 'mp:GiftRequest', 'mp:BarterRequest'],
    dereference: ['mp:hasTimeCondition', 'mp:hasGeoCondition', 'mp:hasReciprocityCondition'],
    permissions: {},
    newResourcesPermissions: {},
    notificationMapping: {
      title: {
        en: `{{emitterProfile.vcard:given-name}} published a classified "{{activity.object.name}}"`,
        fr: `{{emitterProfile.vcard:given-name}} a publié une petite annonce "{{activity.object.name}}"`
      },
    }
  }
};
