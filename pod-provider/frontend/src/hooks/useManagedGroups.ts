import useGroups from './useGroups';

// Groups in which the user has at least one special right
const useManagedGroups = () => {
  const { groups } = useGroups();
  return groups.filter(group => group.rights.specialRights.length > 0);
};

export default useManagedGroups;
