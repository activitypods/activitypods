const { ACTIVITY_TYPES, OBJECT_TYPES } = require('@semapps/activitypub');

const NEW_MESSAGE_ABOUT_OFFER_OR_REQUEST = {
  type: ACTIVITY_TYPES.CREATE,
  object: {
    type: OBJECT_TYPES.NOTE,
    context: {
      type: ['mp:Offer', 'mp:SaleOffer', 'mp:RentOffer', 'mp:LoanOffer', 'mp:GiftOffer', 'mp:BarterOffer', 'mp:Request', 'mp:PurchaseRequest', 'mp:RentRequest', 'mp:LoanRequest', 'mp:GiftRequest', 'mp:BarterRequest']
    }
  },
};

module.exports = {
  NEW_MESSAGE_ABOUT_OFFER_OR_REQUEST
};
