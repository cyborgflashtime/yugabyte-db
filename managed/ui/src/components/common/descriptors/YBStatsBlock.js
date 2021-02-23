// Copyright (c) YugaByte, Inc.

import React from 'react';
import { DescriptionItem } from './';

import './stylesheets/YBStatsBlock.scss';
export const YBStatsBlock = ({ value, label }) => {
  return (
    <div className="tile_stats_count text-center">
      <DescriptionItem>
        <div className="count">{value}</div>
      </DescriptionItem>
      <span className="count_top">{label}</span>
    </div>
  );
}
