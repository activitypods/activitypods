import Autocomplete from '@material-ui/lab/Autocomplete/Autocomplete';
import { arrayFromLdField, colorFromString } from '../../utils';
import { useGetList, useTranslate } from 'react-admin';
import { Checkbox, ListItemAvatar, Avatar, Typography, TextField, Chip } from '@material-ui/core';
import React, { useEffect, useState } from 'react';

/**
 * @typedef {import('./TagsListEdit').Tag} Tag'
 * @typedef {import('react-admin').Record} Record

 * @typedef ResourceSelectWithTagsProps
 * @property {string} props.relationshipPredicate,
 * @property {string} props.labelTagPredicate,
 * @property {string} props.colorTagPredicate,
 * @property {string} props.colorResourcePredicate,
 * @property {string} props.avatarTagPredicate,
 * @property {string} props.avatarResourcePredicate,
 * @property {string} props.labelResourcePredicate,
 * @property {string} props.idResourcePredicate,
 * @property {string} props.idTagPredicate,
 * @property {boolean} props.showColors,
 * @property {JSX.Element} props.resourceDefaultIcon,
 * @property {JSX.Element} props.tagDefaultIcon,
 * @property {string} props.entityResource The resource name of the entities that can be selected.
 * @property {string} props.tagResource The resource name of the tags that can be selected.
 * @property {boolean} props.showColors Whether to show colors, even if the tag doesn't have one.
 * @property {string} props.resourceName Display name of the resource, used for grouping.
 * @property {string} props.tagName Display name of the tag, used for grouping.
 * @property {(ids: import('react-admin').Identifier[]) => void} props.onSelectionChange
 *   Called, when a new set of resources is selected. Includes the ids of all selected resources (not tags):
 * @property {import('react-admin').Identifier[]} props.excludeIds Ids of resources and tags that should not be shown. 
 */

/**
 * This component is in a way the reverse correspondent to TagsListEdit.
 * It is used to select tags from a list of all tags, which will add
 * all entities with the selected tags to the selection.
 * Apart from that, you can of course select the entities directly.
 *
 * @param {import('@material-ui/lab').AutocompleteProps & ResourceSelectWithTagsProps} props
 */
const ResourceSelectWithTags = (props) => {
  // We use a similar approach to `AddPermissionsForm`.
  const {
    relationshipPredicate,
    labelTagPredicate,
    colorTagPredicate,
    colorResourcePredicate,
    avatarTagPredicate,
    avatarResourcePredicate,
    labelResourcePredicate,
    idTagPredicate,
    idResourcePredicate,
    showColors,
    tagResource,
    entityResource,
    resourceDefaultIcon,
    tagDefaultIcon,
    resourceName,
    tagName,
    excludeIds,
    onSelectionChange,
    ...restProps
  } = props;

  const translate = useTranslate();
  // The selected resources are stored in the state, if not provided by the parent.
  const [selectedResourceIds, setSelectedResources] = useState(props.value || []);
  useEffect(() => {
    setSelectedResources(props.value || []);
  }, [props.value]);

  const { data: tagData, isLoading: isLoadingAllTags } = useGetList(tagResource);
  const { data: resourceData, isLoading: isLoadingAllResources } = useGetList(entityResource);

  const options = [
    ...Object.values(tagData)
      .sort((tag1, tag2) => (tag1[labelTagPredicate] || '').localeCompare(tag2[labelTagPredicate]))
      .map((tag) => tag[idTagPredicate]),
    ,
    ...Object.values(resourceData)
      .sort((resource1, resource2) =>
        (resource1[labelResourcePredicate] || '').localeCompare(resource2[labelResourcePredicate])
      )
      .map((resource) => resource[idResourcePredicate]),
  ].filter((id) => !excludeIds.includes(id));

  const isTagSelected = (tag) => {
    const tagOwners = arrayFromLdField(tag[relationshipPredicate]);
    if (tagOwners.length === 0) return false;
    return tagOwners.every((owner) => selectedResourceIds.includes(owner));
  };

  return (
    <Autocomplete
      multiple
      options={options}
      value={selectedResourceIds}
      groupBy={(option) => (tagData[option] ? tagName || tagResource : resourceName || entityResource)}
      getOptionLabel={(id) => resourceData[id]?.[labelResourcePredicate] || tagData[id]?.[labelTagPredicate] || ''}
      onChange={(event, values, reason, { option: optionId }) => {
        // Collect what resources to remove / add.
        const newSelectedResourceIds = [];
        const deselectedResourceIds = [];

        // If the option is a tag, we need to add / remove all resources that have this tag.
        if (tagData[optionId]) {
          const option = tagData[optionId];
          const tagOwners = arrayFromLdField(option[relationshipPredicate]);
          // If the tag was selected...
          // (We can't check `reason` here, because the tags are not part of the values list.)
          if (!isTagSelected(option)) {
            newSelectedResourceIds.push(...tagOwners);
          } else {
            deselectedResourceIds.push(...tagOwners);
          }
        } else if (resourceData[optionId]) {
          if (reason === 'select-option') {
            newSelectedResourceIds.push(optionId);
          } else if (reason === 'remove-option') {
            deselectedResourceIds.push(optionId);
          }
        }

        const allSelectedResourceIds = [
          ...new Set(
            [...selectedResourceIds, ...newSelectedResourceIds].filter((id) => !deselectedResourceIds.includes(id))
          ),
        ];

        onSelectionChange({ ids: allSelectedResourceIds });
        setSelectedResources(allSelectedResourceIds);
      }}
      renderInput={(params) => (
        <TextField {...params} variant="outlined" label={translate('auth.input.agent_select')} fullWidth />
      )}
      renderOption={(optionId) => {
        // If the option is a tag..
        if (tagData[optionId]) {
          const option = tagData[optionId];
          const tagColor = option[colorTagPredicate] || (showColors && colorFromString(option[labelTagPredicate]));
          return (
            <>
              <Checkbox checked={isTagSelected(option)} />
              <ListItemAvatar style={{ marginLeft: '9px', marginRight: '9px', minWidth: '40px' }}>
                {(option[avatarTagPredicate] || tagDefaultIcon) && (
                  <Avatar
                    src={option[avatarTagPredicate]}
                    style={{ backgroundColor: tagColor, border: '1px solid #bdbdbd' }}
                  >
                    {tagDefaultIcon}
                  </Avatar>
                )}
              </ListItemAvatar>
              <Chip
                size="small"
                variant="outlined"
                style={{ backgroundColor: tagColor, marginLeft: '9px' }}
                label={option[labelTagPredicate]}
              />
            </>
          );
          // If the option is a resource...
        } else if (resourceData[optionId]) {
          const option = resourceData[optionId];
          const selected = !!selectedResourceIds.find((id) => id === optionId);
          return (
            <>
              <Checkbox checked={selected} />

              <ListItemAvatar style={{ marginLeft: '9px', marginRight: '9px', minWidth: '40px' }}>
                {(option[avatarResourcePredicate] || resourceDefaultIcon) && (
                  <Avatar
                    src={option[avatarResourcePredicate]}
                    style={{ backgroundColor: option[colorResourcePredicate], border: '1px solid #bdbdbd' }}
                  >
                    {resourceDefaultIcon}
                  </Avatar>
                )}
              </ListItemAvatar>
              <Typography variant="body2" color="textPrimary" style={{ marginLeft: '9px' }}>
                {option[labelResourcePredicate]}
              </Typography>
            </>
          );
        }
      }}
      fullWidth
      disableCloseOnSelect
      loading={isLoadingAllTags || isLoadingAllResources}
      {...restProps}
    />
  );
};

ResourceSelectWithTags.defaultProps = {
  idResourcePredicate: 'id',
  idTagPredicate: 'id',
  showColors: true,
  excludeIds: [],
};

export default ResourceSelectWithTags;
