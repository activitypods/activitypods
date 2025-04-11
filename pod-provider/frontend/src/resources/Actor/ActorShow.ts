import { useEffect } from 'react';
import { useGetRecordId } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { formatUsername } from '../../utils';

const ActorShow = () => {
  const recordId = useGetRecordId();
  const navigate = useNavigate();

  useEffect(() => {
    // @ts-expect-error TS(2345): Argument of type 'Identifier' is not assignable to... Remove this comment to see the full error message
    const username = formatUsername(recordId);
    navigate(`/network/${username}`, { replace: true });
  }, [navigate, recordId]);

  return null;
};

export default ActorShow;
