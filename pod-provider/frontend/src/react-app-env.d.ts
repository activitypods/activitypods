/// <reference types="react-scripts" />

type LangString = {
  '@language': string;
  '@value': string;
};

type RealmData = {
  id: string;
  fullName: string;
  avatar: string;
  webfingerId: string;
  webIdData: any;
};

type Realm = {
  isGroup?: boolean;
  isLoading?: boolean;
  data?: RealmData;
  refetch?: function;
};
