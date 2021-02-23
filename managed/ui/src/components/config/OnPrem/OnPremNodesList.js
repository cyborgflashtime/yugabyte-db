// Copyright (c) YugaByte, Inc.

import _ from 'lodash';
import React, {Component, useEffect, useState} from 'react';
import { Row, Col, Alert } from 'react-bootstrap';
import { BootstrapTable, TableHeaderColumn } from 'react-bootstrap-table';
import { FieldArray } from 'redux-form';
import { Link, withRouter } from 'react-router';

import { getPromiseState } from '../../../utils/PromiseUtils';
import { isNonEmptyObject, isNonEmptyArray } from '../../../utils/ObjectUtils';
import { YBButton, YBModal } from '../../common/forms/fields';
import InstanceTypeForRegion from '../OnPrem/wizard/InstanceTypeForRegion';
import { YBBreadcrumb } from '../../common/descriptors';
import { isDefinedNotNull, isNonEmptyString } from '../../../utils/ObjectUtils';
import { YBCodeBlock } from '../../common/descriptors/index';
import { YBConfirmModal } from '../../modals';

export const OnPremNodesList = withRouter(({
  cloud: { supportedRegionList, accessKeys, providers, nodeInstanceList, instanceTypes },
  showAddNodesDialog,
  reset,
  showConfirmDeleteModal,
  hideDialog,
  deleteInstance,
  createOnPremNodes,
  universeList,
  fetchUniverseList,
  getRegionListItems,
  getInstanceTypeListItems,
  handleSubmit,
  showProviderView,
  visibleModal,
}) => {
  const [nodeToBeDeleted, setNodeToBeDeleted] = useState({})

  const addNodeToList = () => {
    showAddNodesDialog();
  };

  const hideAddNodeModal = () => {
    reset();
    hideDialog();
  };

  const showConfirmDeleteModalLocal = (row) => {
    setNodeToBeDeleted(row);
    showConfirmDeleteModal();
  }

  const hideDeleteNodeModal = () => {
    setNodeToBeDeleted({})
    hideDialog();
  };

  const deleteInstanceLocal = () => {

    const onPremProvider = providers.data.find((provider) => provider.code === 'onprem');
    const row = nodeToBeDeleted;
    if (!row.inUse) {
      deleteInstance(onPremProvider.uuid, row.ip);
    }
    hideDeleteNodeModal();
  };

  const submitAddNodesForm = (vals) => {

    const onPremProvider = providers.data.find((provider) => provider.code === 'onprem');
    const currentCloudRegions = supportedRegionList.data.filter(
      (region) => region.provider.code === 'onprem'
    );
    const currentCloudAccessKey = accessKeys.data
      .filter((accessKey) => accessKey.idKey.providerUUID === onPremProvider.uuid)
      .shift();
    // function to construct list of all zones in current configuration
    const zoneList = currentCloudRegions.reduce(function (azs, r) {
      azs[r.code] = [];
      r.zones.map((z) => (azs[r.code][z.code.trim()] = z.uuid));
      return azs;
    }, {});

    // function takes in node list and returns node object keyed by zone
    const getInstancesKeyedByZone = function (instances, region, zoneList) {
      if (isNonEmptyArray(instances[region])) {
        return instances[region].reduce(function (acc, val) {
          if (isNonEmptyObject(val) && isNonEmptyString(val.zone)) {
            const currentZone = val.zone.trim();
            const instanceName = isNonEmptyString(val.instanceName) ? val.instanceName.trim() : '';
            const currentZoneUUID = zoneList[region][currentZone];
            acc[currentZoneUUID] = acc[currentZoneUUID] || [];
            acc[currentZoneUUID].push({
              zone: currentZone,
              region: region,
              ip: val.instanceTypeIP.trim(),
              instanceType: val.machineType,
              sshUser: isNonEmptyObject(currentCloudAccessKey)
                ? currentCloudAccessKey.keyInfo.sshUser
                : '',
              sshPort: isNonEmptyObject(currentCloudAccessKey)
                ? currentCloudAccessKey.keyInfo.sshPort
                : null,
              instanceName: instanceName
            });
          }
          return acc;
        }, {});
      } else {
        return null;
      }
    };

    // function to construct final payload to be sent to middleware
    let instanceTypeList = [];
    if (isNonEmptyObject(vals.instances)) {
      instanceTypeList = Object.keys(vals.instances)
        .map(function (region) {
          const instanceListByZone = getInstancesKeyedByZone(vals.instances, region, zoneList);
          return isNonEmptyObject(instanceListByZone) ? instanceListByZone : null;
        })
        .filter(Boolean);
      if (isNonEmptyArray(instanceTypeList)) {
        createOnPremNodes(instanceTypeList, onPremProvider.uuid);
      } else {
        hideAddNodeModal();
      }
    }
    reset();
  };

  const handleCheckNodesUsage = (inUse, row) => {
    let result = 'n/a';
    if (inUse) {
      if (getPromiseState(universeList).isLoading() || getPromiseState(universeList).isInit()) {
        result = 'Loading...';
      } else if (getPromiseState(universeList).isSuccess()) {
        const universe = universeList.data.find((item) => {
          // TODO: match by nodeUuid when it's fully supported by universe
          return !!(item.universeDetails.nodeDetailsSet || []).find(
            (node) => node.nodeName && row.nodeName && node.nodeName === row.nodeName
          );
        });
        if (universe) {
          result = <Link to={`/universes/${universe.universeUUID}`}>{universe.name}</Link>;
        }
      }
    } else {
      result = 'NOT USED';
    }

    return result;
  };

  useEffect(() => {
    if (!getPromiseState(universeList).isSuccess()) {
      fetchUniverseList();
    }
    // Get OnPrem provider if provider list is already loaded during component load
    const onPremProvider = providers.data.find(
      (provider) => provider.code === 'onprem'
    );
    getRegionListItems(onPremProvider.uuid);
    getInstanceTypeListItems(onPremProvider.uuid);
  }, [])


  let nodeListItems = [];
  if (getPromiseState(nodeInstanceList).isSuccess()) {
    nodeListItems = nodeInstanceList.data.map(function (item) {
      return {
        nodeId: item.nodeUuid,
        nodeName: item.nodeName,
        inUse: item.inUse,
        ip: item.details.ip,
        instanceType: item.details.instanceType,
        region: item.details.region,
        zone: item.details.zone,
        zoneUuid: item.zoneUuid,
        instanceName: item.instanceName
      };
    });
  }
  const removeNodeItem = function (cell, row) {
    if (row) {
      if (row.inUse) {
        return <i className={`fa fa-trash remove-cell-container`}/>;
      } else {
        return (
          <i
            className={`fa fa-trash remove-cell-container remove-cell-active`}
            onClick={() => {
              showConfirmDeleteModalLocal(row);
            }}
          />
        );
      }
    }
  };

  let provisionMessage = <span/>;
  const onPremProvider = providers.data.find((provider) => provider.code === 'onprem');
  let useHostname = false;
  if (isDefinedNotNull(onPremProvider)) {
    useHostname = _.get(onPremProvider, 'config.USE_HOSTNAME', false) === 'true';
    const onPremKey = accessKeys.data.find(
      (accessKey) => accessKey.idKey.providerUUID === onPremProvider.uuid
    );
    if (isDefinedNotNull(onPremKey) && onPremKey.keyInfo.skipProvisioning) {
      provisionMessage = (
        <Alert bsStyle="warning" className="pre-provision-message">
          You need to pre-provision your nodes, Please execute the following script on the
          Yugabyte Platform host machine once for each instance that you add here.
          <YBCodeBlock>
            {onPremKey.keyInfo.provisionInstanceScript + ' --ip '}
            <b>{'<IP Address> '}</b>
            {'--mount_points '}
            <b>{'<instance type mount points>'}</b>
          </YBCodeBlock>
        </Alert>
      );
    }
  }


  const currentCloudRegions = supportedRegionList.data.filter(
    (region) => region.provider.code === 'onprem'
  );
  const regionFormTemplate = isNonEmptyArray(currentCloudRegions)
    ? currentCloudRegions.map(function (regionItem, idx) {
      const zoneOptions = regionItem.zones.map(function (zoneItem, zoneIdx) {
        return (
          <option key={zoneItem + zoneIdx} value={zoneItem.code}>
            {zoneItem.code}
          </option>
        );
      });
      const machineTypeOptions = instanceTypes.data.map(function (machineTypeItem, mcIdx) {
        return (
          <option key={machineTypeItem + mcIdx} value={machineTypeItem.instanceTypeCode}>
            {machineTypeItem.instanceTypeCode}
          </option>
        );
      });
      zoneOptions.unshift(
        <option key={-1} value={''}>
          Select
        </option>
      );
      machineTypeOptions.unshift(
        <option key={-1} value={''}>
          Select
        </option>
      );
      return (
        <div key={`instance${idx}`}>
          <div className="instance-region-type">{regionItem.code}</div>
          <div className="form-field-grid">
            <FieldArray
              name={`instances.${regionItem.code}`}
              component={InstanceTypeForRegion}
              zoneOptions={zoneOptions}
              machineTypeOptions={machineTypeOptions}
              useHostname={useHostname}
              formType={'modal'}
            />
          </div>
        </div>
      );
    })
    : null;
  const deleteConfirmationText = `Are you sure you want to delete node${
    isNonEmptyObject(nodeToBeDeleted) && nodeToBeDeleted.nodeName
      ? ' ' + nodeToBeDeleted.nodeName
      : ''
  }?`;
  const modalAddressSpecificText = useHostname ? 'hostnames' : 'IP addresses';
  return (
    <div className="onprem-node-instances">
      <span className="buttons pull-right">
        <YBButton btnText="Add Instances" btnIcon="fa fa-plus" onClick={addNodeToList}/>
      </span>

      <YBBreadcrumb to="/config/cloud/onprem" onClick={showProviderView}>
        On-Premises Datacenter Config
      </YBBreadcrumb>
      <h3 className="onprem-node-instances__title">Instances</h3>

      {provisionMessage}

      <Row>
        <Col xs={12}>
          <BootstrapTable
            data={nodeListItems}
            search
            multiColumnSearch
            options={{
              clearSearch: true
            }}
            containerClass="onprem-nodes-table"
          >
            <TableHeaderColumn dataField="nodeId" isKey={true} hidden={true} dataSort/>
            <TableHeaderColumn dataField="instanceName" dataSort>
              Identifier
            </TableHeaderColumn>
            <TableHeaderColumn dataField="ip" dataSort>
              Address
            </TableHeaderColumn>
            <TableHeaderColumn dataField="inUse" dataFormat={handleCheckNodesUsage} dataSort>
              Universe Name
            </TableHeaderColumn>
            <TableHeaderColumn dataField="region" dataSort>
              Region
            </TableHeaderColumn>
            <TableHeaderColumn dataField="zone" dataSort>
              Zone
            </TableHeaderColumn>
            <TableHeaderColumn dataField="instanceType" dataSort>
              Instance Type
            </TableHeaderColumn>
            <TableHeaderColumn dataField="" dataFormat={removeNodeItem}/>
          </BootstrapTable>
        </Col>
      </Row>
      <YBModal
        title={'Add Instances'}
        formName={'AddNodeForm'}
        visible={visibleModal === 'AddNodesForm'}
        onHide={hideAddNodeModal}
        onFormSubmit={handleSubmit(submitAddNodesForm)}
        showCancelButton={true}
        submitLabel="Add"
        size="large"
      >
        <div className="on-prem-form-text">
          {`Enter ${modalAddressSpecificText} for the instances of each availability zone and instance type.`}
        </div>
        {regionFormTemplate}
      </YBModal>
      <YBConfirmModal
        name={'confirmDeleteNodeInstance'}
        title={'Delete Node'}
        hideConfirmModal={hideDeleteNodeModal}
        currentModal={'confirmDeleteNodeInstance'}
        visibleModal={visibleModal}
        onConfirm={deleteInstanceLocal}
        confirmLabel={'Delete'}
        cancelLabel={'Cancel'}
      >
        {deleteConfirmationText}
      </YBConfirmModal>
    </div>
  );
})
