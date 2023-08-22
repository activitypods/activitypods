import Autocomplete from '@material-ui/lab/Autocomplete/Autocomplete';
import { arrayFromLdField, colorFromString } from '../../utils';
import { useGetList, useTranslate } from 'react-admin';
import { Checkbox, ListItemAvatar, Avatar, Typography, TextField, Chip } from '@material-ui/core';
import React, { useEffect, useState } from 'react';

/**
 * @typedef {import('react-admin').Record} Record

 * @typedef ResourceSelectWithTagsProps
 * @property {string} relationshipPredicate Tag field name that contains the list of resource ids.
 * @property {string} labelTagPredicate Tag field name that contains the tag label to show.
 * @property {string} [colorTagPredicate] Tag field name that contains the tag color, if present.
 * @property {string} [avatarTagPredicate] Tag field name that contains the tag avatar URI, if present.
 * @property {string} [colorResourcePredicate] Resource field name that contains the resource color, if present.
 * @property {string} [avatarResourcePredicate] Resource field name that contains the resource avatar URI, if present.
 * @property {string} labelResourcePredicate Resource field name that contains the resource label to show.
 * @property {boolean} showColors Whether to color tags (based on the tag name), when the tag doesn't have one.
 * @property {JSX.Element} [resourceDefaultIcon] Icon to show for resources that don't have an avatar.
 * @property {JSX.Element} [tagDefaultIcon] Icon to show for tags that don't have an avatar.
 * @property {string} entityResource The resource name of the entities that can be selected.
 * @property {string} tagResource The resource name of the tags that can be selected.
 * @property {string} resourceName Display name of the resource, used for grouping.
 * @property {string} tagName Display name of the tag, used for grouping.
 * @property {(ids: import('react-admin').Identifier[]) => void} onSelectionChange
 *   Called, when a new set of resources is selected. Includes the ids of all selected resources (not tags):
 * @property {import('react-admin').Identifier[]} excludeIds Ids of resources and tags that won't not be shown.
 *  This is for example useful, when a tag's owners are to be edited with this component.
 * @property {(tag: Record, selected: boolean) => JSX.Element} renderTagOption
 *  Custom renderer for tag options. Receives the tag record and whether it is selected.
 * @property {(resource: Record, selected: boolean) => JSX.Element} renderResourceOption
 *  Custom renderer for resource options. Receives the resource record and whether it is selected.
*/

/**
 * Autocomplete select that allows to select resources based on
 * their tags besides regular resource selection.
 *
 * The tag resources need to have a relationship field that is a list of resource ids.
 *
 * @param {import('@material-ui/lab').AutocompleteProps & ResourceSelectWithTagsProps} props
 */
const ResourceSelectWithTags = (props) => {
  const {
    relationshipPredicate,
    labelTagPredicate,
    colorTagPredicate,
    colorResourcePredicate,
    avatarTagPredicate,
    avatarResourcePredicate,
    labelResourcePredicate,
    showColors,
    tagResource,
    entityResource,
    resourceDefaultIcon,
    tagDefaultIcon,
    resourceName,
    tagName,
    excludeIds,
    onSelectionChange,
    renderTagOption: renderTagOptionProp,
    renderResourceOption: renderResourceOptionProp,
    ...restProps
  } = props;

  const translate = useTranslate();
  // The selected resource state is maintained by the parent, if props.value is set.
  const [selectedResourceIds, setSelectedResources] = useState(props.value || []);
  useEffect(() => {
    setSelectedResources(props.value || []);
  }, [props.value]);

  const { data: tagData, isLoading: isLoadingTags } = useGetList(tagResource);
  const { data: resourceData, isLoading: isLoadingResources } = useGetList(entityResource);

  // Create list of all resources and tags, sorted by their label as autocomplete select options.
  // First, all tags are shown, then all resources.
  const options = [
    ...Object.values(tagData)
      .sort((tag1, tag2) => (tag1[labelTagPredicate] || '').localeCompare(tag2[labelTagPredicate]))
      .map((tag) => tag.id),
    ...Object.values(resourceData)
      .sort((resource1, resource2) =>
        (resource1[labelResourcePredicate] || '').localeCompare(resource2[labelResourcePredicate])
      )
      .map((resource) => resource.id),
    // Exclude ids that should not be shown.
  ].filter((id) => !excludeIds.includes(id));

  // We use this helper to identify selected tags, since those are not part
  // of the values list (i.e. selectedResourceIds).
  const isTagSelected = (tag) => {
    const tagOwners = arrayFromLdField(tag[relationshipPredicate]);
    if (tagOwners.length === 0) return false;
    return tagOwners.every((owner) => selectedResourceIds.includes(owner));
  };

  const handleChange = (event, values, reason, { option: optionId }) => {
    // Collect what resources to remove / add.
    const newSelectedResourceIds = [];
    const deselectedResourceIds = [];

    // If the option is a tag, we need to add / remove all resources that have this tag.
    if (tagData[optionId]) {
      const clickedTag = tagData[optionId];
      const tagOwners = arrayFromLdField(clickedTag[relationshipPredicate]);
      // If the tag was selected...
      // (We can't check `reason` here, because the tags are not part of the values list.)
      if (!isTagSelected(clickedTag)) {
        newSelectedResourceIds.push(...tagOwners);
      } else {
        deselectedResourceIds.push(...tagOwners);
      }
      // If the option was a resource...
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

    setSelectedResources(allSelectedResourceIds);
    onSelectionChange({ ids: allSelectedResourceIds });
  };

  const renderTagOption =
    renderTagOptionProp ||
    function (tag, selected) {
      const tagColor = tag[colorTagPredicate] || (showColors && colorFromString(tag[labelTagPredicate]));
      return (
        <>
          <Checkbox checked={selected} />
          {(tag[avatarTagPredicate] || tagDefaultIcon) && (
            <ListItemAvatar
              style={{
                marginLeft: '9px',
                marginRight: '9px',
                minWidth: '40px',
              }}
            >
              <Avatar
                src={tag[avatarTagPredicate]}
                style={{
                  backgroundColor: tagColor,
                  border: '1px solid #bdbdbd',
                }}
              >
                {tagDefaultIcon}
              </Avatar>
            </ListItemAvatar>
          )}
          <Chip
            size="small"
            variant="outlined"
            style={{ backgroundColor: tagColor, marginLeft: '9px' }}
            label={tag[labelTagPredicate]}
          />
        </>
      );
    };

  const renderResourceOption =
    renderResourceOptionProp ||
    function (option, selected) {
      return (
        <>
          <Checkbox checked={selected} />

          {(option[avatarResourcePredicate] || resourceDefaultIcon) && (
            <ListItemAvatar
              style={{
                marginLeft: '9px',
                marginRight: '9px',
                minWidth: '40px',
              }}
            >
              <Avatar
                src={option[avatarResourcePredicate]}
                style={{
                  backgroundColor: option[colorResourcePredicate],
                  border: '1px solid #bdbdbd',
                }}
              >
                {resourceDefaultIcon}
              </Avatar>
            </ListItemAvatar>
          )}
          <Typography variant="body2" color="textPrimary" style={{ marginLeft: '9px' }}>
            {option[labelResourcePredicate]}
          </Typography>
        </>
      );
    };

  return (
    <Autocomplete
      multiple
      options={options}
      value={selectedResourceIds}
      groupBy={(option) => (tagData[option] ? tagName || tagResource : resourceName || entityResource)}
      getOptionLabel={(id) => resourceData[id]?.[labelResourcePredicate] || tagData[id]?.[labelTagPredicate] || ''}
      onChange={handleChange}
      renderInput={(params) => (
        <TextField {...params} variant="outlined" label={translate('auth.input.agent_select')} fullWidth />
      )}
      renderOption={(optionId) => {
        // If the option is a tag..
        if (tagData[optionId]) {
          return renderTagOption(tagData[optionId], isTagSelected(tagData[optionId]));
        } else if (resourceData[optionId]) {
          return renderResourceOption(resourceData[optionId], selectedResourceIds.includes(optionId));
        }
      }}
      loading={isLoadingTags || isLoadingResources}
      fullWidth
      disableCloseOnSelect
      closeIcon={null}
      {...restProps}
    />
  );
};

ResourceSelectWithTags.defaultProps = {
  showColors: true,
  excludeIds: [],
};

export default ResourceSelectWithTags;
