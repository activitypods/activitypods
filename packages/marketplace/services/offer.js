const { ControlledContainerMixin } = require('@semapps/ldp');
const { AnnouncerMixin } = require('@activitypods/announcer');
const { SynchronizerMixin } = require('@activitypods/synchronizer');

module.exports = {
  name: 'marketplace.offer',
  mixins: [SynchronizerMixin, AnnouncerMixin, ControlledContainerMixin],
  settings: {
    path: '/offers',
    acceptedTypes: ['mp:Offer', 'mp:SaleOffer', 'mp:RentOffer', 'mp:LoanOffer', 'mp:GiftOffer', 'mp:BarterOffer'],
    dereference: ['mp:hasTimeCondition', 'mp:hasGeoCondition', 'mp:hasReciprocityCondition'],
    permissions: {},
    newResourcesPermissions: {},
    notificationMapping: {
      key: 'new_offer',
      title: {
        en: `{{emitterProfile.vcard:given-name}} published a classified "{{activity.object.pair:label}}"`,
        fr: `{{emitterProfile.vcard:given-name}} a publié une petite annonce "{{activity.object.pair:label}}"`,
      },
      actionLink: '/offers/{{encodeUri activity.object.id}}',
    },
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
      },
    },
  },
};
