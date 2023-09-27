const { ControlledContainerMixin } = require('@semapps/ldp');
const { AnnouncerMixin } = require('@activitypods/announcer');

module.exports = {
  name: 'marketplace.request',
  mixins: [AnnouncerMixin, ControlledContainerMixin],
  settings: {
    path: '/requests',
    acceptedTypes: [
      'mp:Request',
      'mp:PurchaseRequest',
      'mp:RentRequest',
      'mp:LoanRequest',
      'mp:GiftRequest',
      'mp:BarterRequest'
    ],
    dereference: ['mp:hasTimeCondition', 'mp:hasGeoCondition', 'mp:hasReciprocityCondition'],
    permissions: {},
    newResourcesPermissions: {},
    notificationMapping: {
      key: 'new_request',
      title: {
        en: `{{emitterProfile.vcard:given-name}} published a classified "{{activity.object.pair:label}}"`,
        fr: `{{emitterProfile.vcard:given-name}} a publié une petite annonce "{{activity.object.pair:label}}"`
      },
      actionLink: '?type=mp:Request&uri={{encodeUri activity.object.id}}'
    }
  },
  hooks: {
    after: {
      async create(ctx, res) {
        await ctx.call('marketplace.location.setNewRights', res);
        return res;
      },
      // TODO handle new PATCH method https://github.com/assemblee-virtuelle/activitypods/issues/42
      // async patch(ctx, res) {
      //   await ctx.call('marketplace.location.updateRights', res);
      //   return res;
      // },
      async put(ctx, res) {
        await ctx.call('marketplace.location.updateRights', res);
        return res;
      }
    }
  }
};
