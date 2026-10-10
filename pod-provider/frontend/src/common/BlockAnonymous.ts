import { useCheckAuthenticated } from '@semapps/auth-provider';

const BlockAnonymous = ({ message, children }: any) => {
  const { identity } = useCheckAuthenticated(message);
  if (identity?.id) {
    return children;
  } else {
    return null;
  }
};

export default BlockAnonymous;
