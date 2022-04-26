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
        en: `{{emitterProfile.vcard:given-name}} published a classified "{{activity.object.pair:label}}"`,
        fr: `{{emitterProfile.vcard:given-name}} a publié une petite annonce "{{activity.object.pair:label}}"`
      },
    }
  },
  hooks: {
    after: {
      async create(ctx, res) {
        await ctx.call('marketplace.location.setNewRights', res);
        return res;
      },
      async patch(ctx, res) {
        await ctx.call('marketplace.location.updateRights', res);
        return res;
      },
      async put(ctx, res) {
        await ctx.call('marketplace.location.updateRights', res);
        return res;
      },
    }
  }
};
