import React, { useState } from 'react';
import { Tabs, Typography, Table, Progress, Tag, Collapse, Space, Statistic, Row, Col, Card, Alert } from 'antd';
import { 
  CheckCircleOutlined, 
  WarningOutlined, 
  CloseCircleOutlined,
  InfoCircleOutlined 
} from '@ant-design/icons';
import { BenchmarkData } from '../hooks/useSpineApp';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

interface InfoPanelProps {
  data: BenchmarkData;
  onClose: () => void;
}

export const InfoPanel: React.FC<InfoPanelProps> = ({ data }) => {
  const [activeTab, setActiveTab] = useState('summary');
  
  // Parse the HTML data to extract metrics (in a real app, this would come as structured data)
  const parseScore = (html: string): number => {
    const match = html.match(/Score: (\d+)/);
    return match ? parseInt(match[1]) : 0;
  };

  const getScoreColor = (score: number): string => {
    if (score >= 85) return '#52c41a';
    if (score >= 70) return '#73d13d';
    if (score >= 55) return '#faad14';
    if (score >= 40) return '#fa8c16';
    return '#f5222d';
  };

  const getScoreIcon = (score: number) => {
    if (score >= 85) return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    if (score >= 55) return <WarningOutlined style={{ color: '#faad14' }} />;
    return <CloseCircleOutlined style={{ color: '#f5222d' }} />;
  };

  const renderSummaryTab = () => {
    const overallScore = parseScore(data.summary || '');
    const scoreColor = getScoreColor(overallScore);

    return (
      <div style={{ padding: 24 }}>
        <Card style={{ marginBottom: 24, background: '#141414', borderColor: '#303030' }}>
          <Row gutter={24} align="middle">
            <Col span={8}>
              <Statistic
                title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Overall Performance Score</Text>}
                value={overallScore}
                suffix={<Text style={{ color: scoreColor, fontSize: 24 }}>/ 100</Text>}
                valueStyle={{ color: scoreColor, fontSize: 48 }}
                prefix={getScoreIcon(overallScore)}
              />
            </Col>
            <Col span={16}>
              <Progress
                percent={overallScore}
                strokeColor={{
                  '0%': scoreColor,
                  '100%': scoreColor,
                }}
                format={() => ''}
                style={{ marginBottom: 16 }}
              />
              <Space direction="vertical" style={{ width: '100%' }}>
                <Tag color={overallScore >= 85 ? 'success' : overallScore >= 55 ? 'warning' : 'error'}>
                  {overallScore >= 85 ? 'Excellent' : overallScore >= 55 ? 'Moderate' : 'Poor'} Performance
                </Tag>
                <Text type="secondary" style={{ color: 'rgba(255, 255, 255, 0.65)' }}>
                  {overallScore >= 85 
                    ? 'Suitable for all platforms and continuous animations'
                    : overallScore >= 55 
                    ? 'May cause performance dips, especially with multiple instances'
                    : 'Performance issues likely on most devices'}
                </Text>
              </Space>
            </Col>
          </Row>
        </Card>

        <Title level={4} style={{ color: '#fff', marginBottom: 16 }}>
          <InfoCircleOutlined /> Performance Breakdown
        </Title>
        
        <Row gutter={[16, 16]}>
          <Col span={12}>
            <Card 
              size="small" 
              style={{ background: '#1f1f1f', borderColor: '#303030' }}
              bodyStyle={{ padding: 16 }}
            >
              <Statistic
                title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Bone Structure</Text>}
                value={85}
                suffix={<Text style={{ color: '#52c41a', fontSize: 16 }}>%</Text>}
                valueStyle={{ color: '#52c41a', fontSize: 24 }}
              />
            </Card>
          </Col>
          <Col span={12}>
            <Card 
              size="small" 
              style={{ background: '#1f1f1f', borderColor: '#303030' }}
              bodyStyle={{ padding: 16 }}
            >
              <Statistic
                title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Mesh Complexity</Text>}
                value={72}
                suffix={<Text style={{ color: '#73d13d', fontSize: 16 }}>%</Text>}
                valueStyle={{ color: '#73d13d', fontSize: 24 }}
              />
            </Card>
          </Col>
          <Col span={12}>
            <Card 
              size="small" 
              style={{ background: '#1f1f1f', borderColor: '#303030' }}
              bodyStyle={{ padding: 16 }}
            >
              <Statistic
                title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Clipping Masks</Text>}
                value={90}
                suffix={<Text style={{ color: '#52c41a', fontSize: 16 }}>%</Text>}
                valueStyle={{ color: '#52c41a', fontSize: 24 }}
              />
            </Card>
          </Col>
          <Col span={12}>
            <Card 
              size="small" 
              style={{ background: '#1f1f1f', borderColor: '#303030' }}
              bodyStyle={{ padding: 16 }}
            >
              <Statistic
                title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Blend Modes</Text>}
                value={65}
                suffix={<Text style={{ color: '#faad14', fontSize: 16 }}>%</Text>}
                valueStyle={{ color: '#faad14', fontSize: 24 }}
              />
            </Card>
          </Col>
        </Row>

        <Alert
          message={<Text style={{ color: '#fff' }}>Optimization Recommendations</Text>}
          description={
            <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
              <li><Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>Reduce the number of non-normal blend modes to minimize render state changes</Text></li>
              <li><Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>Consider simplifying mesh structures with high vertex counts</Text></li>
              <li><Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>Optimize bone hierarchy depth for better transformation performance</Text></li>
            </ul>
          }
          type="info"
          showIcon
          style={{ marginTop: 24, background: '#1f1f1f', borderColor: '#303030' }}
        />
      </div>
    );
  };

  const renderMeshAnalysisTab = () => {
    const meshData = [
      { slot: 'body', vertices: 124, deformed: true, boneWeights: 4, hasParent: false },
      { slot: 'head', vertices: 86, deformed: true, boneWeights: 2, hasParent: false },
      { slot: 'arm_left', vertices: 42, deformed: false, boneWeights: 1, hasParent: true },
      { slot: 'arm_right', vertices: 42, deformed: false, boneWeights: 1, hasParent: true },
    ];

    const columns = [
      {
        title: <Text style={{ color: '#fff' }}>Slot</Text>,
        dataIndex: 'slot',
        key: 'slot',
        render: (text: string) => <Text style={{ color: '#fff' }}>{text}</Text>,
      },
      {
        title: <Text style={{ color: '#fff' }}>Vertices</Text>,
        dataIndex: 'vertices',
        key: 'vertices',
        sorter: (a: any, b: any) => a.vertices - b.vertices,
        render: (vertices: number) => (
          <Tag color={vertices > 100 ? 'error' : vertices > 50 ? 'warning' : 'success'}>
            {vertices}
          </Tag>
        ),
      },
      {
        title: <Text style={{ color: '#fff' }}>Deformed</Text>,
        dataIndex: 'deformed',
        key: 'deformed',
        render: (deformed: boolean) => (
          <Tag color={deformed ? 'warning' : 'default'}>
            {deformed ? 'Yes' : 'No'}
          </Tag>
        ),
      },
      {
        title: <Text style={{ color: '#fff' }}>Bone Weights</Text>,
        dataIndex: 'boneWeights',
        key: 'boneWeights',
        render: (weights: number) => <Text style={{ color: '#fff' }}>{weights}</Text>,
      },
      {
        title: <Text style={{ color: '#fff' }}>Has Parent Mesh</Text>,
        dataIndex: 'hasParent',
        key: 'hasParent',
        render: (hasParent: boolean) => (
          <Tag color={hasParent ? 'blue' : 'default'}>
            {hasParent ? 'Yes' : 'No'}
          </Tag>
        ),
      },
    ];

    return (
      <div style={{ padding: 24 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Card style={{ background: '#141414', borderColor: '#303030' }}>
            <Row gutter={16}>
              <Col span={6}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Total Meshes</Text>}
                  value={4} 
                  valueStyle={{ color: '#fff' }}
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Total Vertices</Text>}
                  value={294} 
                  valueStyle={{ color: '#fff' }}
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Deformed Meshes</Text>}
                  value={2} 
                  valueStyle={{ color: '#faad14' }}
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Weighted Meshes</Text>}
                  value={4} 
                  valueStyle={{ color: '#1890ff' }}
                />
              </Col>
            </Row>
          </Card>

          <Table
            columns={columns}
            dataSource={meshData}
            rowKey="slot"
            pagination={false}
            style={{ background: '#141414' }}
            rowClassName={(record) => {
              if (record.vertices > 100) return 'ant-table-row-error';
              if (record.vertices > 50) return 'ant-table-row-warning';
              return '';
            }}
          />

          <Collapse 
            defaultActiveKey={['1']} 
            style={{ background: '#141414', borderColor: '#303030' }}
          >
            <Panel 
              header={<Text style={{ color: '#fff' }}>Mesh Performance Impact</Text>}
              key="1"
              style={{ background: '#1f1f1f', borderColor: '#303030' }}
            >
              <Space direction="vertical">
                <Text style={{ color: '#fff' }}><strong>Vertex Count:</strong> Each vertex requires memory and processing time. High vertex counts (&gt;50) have significant impact.</Text>
                <Text style={{ color: '#fff' }}><strong>Deformation:</strong> Deforming meshes requires extra calculations per frame - 1.5× more costly than static meshes.</Text>
                <Text style={{ color: '#fff' }}><strong>Bone Weights:</strong> Each bone weight adds matrix multiplication operations - 2× more impact per weighted vertex.</Text>
                <Text type="warning" style={{ color: '#faad14' }}><strong>Optimization Tip:</strong> Use fewer vertices for meshes that deform or have bone weights.</Text>
              </Space>
            </Panel>
          </Collapse>
        </Space>
      </div>
    );
  };

  const renderClippingTab = () => {
    const clippingData = [
      { slot: 'mask_1', vertices: 4, status: 'optimal' },
      { slot: 'mask_2', vertices: 6, status: 'acceptable' },
    ];

    const columns = [
      {
        title: <Text style={{ color: '#fff' }}>Slot Name</Text>,
        dataIndex: 'slot',
        key: 'slot',
        render: (text: string) => <Text style={{ color: '#fff' }}>{text}</Text>,
      },
      {
        title: <Text style={{ color: '#fff' }}>Vertex Count</Text>,
        dataIndex: 'vertices',
        key: 'vertices',
        render: (vertices: number) => (
          <Tag color={vertices <= 4 ? 'success' : vertices <= 8 ? 'warning' : 'error'}>
            {vertices}
          </Tag>
        ),
      },
      {
        title: <Text style={{ color: '#fff' }}>Status</Text>,
        dataIndex: 'status',
        key: 'status',
        render: (status: string) => {
          const color = status === 'optimal' ? 'success' : status === 'acceptable' ? 'warning' : 'error';
          const icon = status === 'optimal' ? <CheckCircleOutlined /> : <WarningOutlined />;
          return <Tag color={color} icon={icon}>{status.toUpperCase()}</Tag>;
        },
      },
    ];

    return (
      <div style={{ padding: 24 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Alert
            message={<Text style={{ color: '#fff' }}>Clipping Performance Impact</Text>}
            description={<Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>Clipping masks are one of the most expensive operations in Spine rendering. Each mask requires additional GPU rendering passes.</Text>}
            type="warning"
            showIcon
            style={{ background: '#1f1f1f', borderColor: '#303030' }}
          />

          <Card style={{ background: '#141414', borderColor: '#303030' }}>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Total Masks</Text>}
                  value={2} 
                  valueStyle={{ color: '#fff' }}
                />
              </Col>
              <Col span={8}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Total Vertices</Text>}
                  value={10} 
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
              <Col span={8}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Complex Masks (&gt;4 vertices)</Text>}
                  value={1} 
                  valueStyle={{ color: '#faad14' }}
                />
              </Col>
            </Row>
          </Card>

          <Table
            columns={columns}
            dataSource={clippingData}
            rowKey="slot"
            pagination={false}
            style={{ background: '#141414' }}
          />

          <Card 
            title={<Text style={{ color: '#fff' }}>Optimization Guidelines</Text>}
            style={{ background: '#141414', borderColor: '#303030' }}
          >
            <Space direction="vertical">
              <Text style={{ color: '#fff' }}>✓ Use triangular or quadrilateral masks (3-4 vertices) whenever possible</Text>
              <Text style={{ color: '#fff' }}>✓ Limit to 2-3 masks per skeleton</Text>
              <Text style={{ color: '#fff' }}>✓ Each vertex in a mask increases computational cost</Text>
              <Text type="danger" style={{ color: '#f5222d' }}>✗ Avoid complex masks with many vertices</Text>
            </Space>
          </Card>
        </Space>
      </div>
    );
  };

  const renderBlendModesTab = () => {
    const blendModeData = [
      { mode: 'Normal', count: 12, impact: 'low' },
      { mode: 'Additive', count: 2, impact: 'high' },
      { mode: 'Multiply', count: 1, impact: 'high' },
    ];

    const columns = [
      {
        title: <Text style={{ color: '#fff' }}>Blend Mode</Text>,
        dataIndex: 'mode',
        key: 'mode',
        render: (mode: string) => (
          <Tag color={mode === 'Normal' ? 'success' : 'warning'}>
            {mode}
          </Tag>
        ),
      },
      {
        title: <Text style={{ color: '#fff' }}>Count</Text>,
        dataIndex: 'count',
        key: 'count',
        render: (count: number) => <Text style={{ color: '#fff' }}>{count}</Text>,
      },
      {
        title: <Text style={{ color: '#fff' }}>Performance Impact</Text>,
        dataIndex: 'impact',
        key: 'impact',
        render: (impact: string) => {
          const color = impact === 'low' ? 'success' : 'error';
          const icon = impact === 'low' ? <CheckCircleOutlined /> : <WarningOutlined />;
          return <Tag color={color} icon={icon}>{impact.toUpperCase()}</Tag>;
        },
      },
    ];

    return (
      <div style={{ padding: 24 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Card style={{ background: '#141414', borderColor: '#303030' }}>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Non-Normal Blend Modes</Text>}
                  value={3} 
                  valueStyle={{ color: '#faad14' }}
                  prefix={<WarningOutlined />}
                />
              </Col>
              <Col span={8}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Additive Blend Modes</Text>}
                  value={2} 
                  valueStyle={{ color: '#fa8c16' }}
                />
              </Col>
              <Col span={8}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Performance Score</Text>}
                  value={75} 
                  suffix={<Text style={{ color: '#73d13d', fontSize: 16 }}>/ 100</Text>}
                  valueStyle={{ color: '#73d13d' }}
                />
              </Col>
            </Row>
          </Card>

          <Table
            columns={columns}
            dataSource={blendModeData}
            rowKey="mode"
            pagination={false}
            style={{ background: '#141414' }}
          />

          <Alert
            message={<Text style={{ color: '#fff' }}>Blend Mode Recommendations</Text>}
            description={
              <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
                <li><Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>Normal Blend Mode: Most efficient, requires a single rendering pass</Text></li>
                <li><Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>Non-Normal Blend Modes: Each requires a separate render pass or shader switch</Text></li>
                <li><Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>Recommendation: Limit to 2 non-normal blend modes per skeleton</Text></li>
              </ul>
            }
            type="info"
            showIcon
            style={{ background: '#1f1f1f', borderColor: '#303030' }}
          />
        </Space>
      </div>
    );
  };

  const renderSkeletonTreeTab = () => {
    return (
      <div style={{ padding: 24 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Card style={{ background: '#141414', borderColor: '#303030' }}>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Total Bones</Text>}
                  value={7} 
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
              <Col span={8}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Root Bones</Text>}
                  value={1} 
                  valueStyle={{ color: '#1890ff' }}
                />
              </Col>
              <Col span={8}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Max Depth</Text>}
                  value={3} 
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
            </Row>
          </Card>

          <Card 
            title={<Text style={{ color: '#fff' }}>Bone Hierarchy</Text>}
            style={{ background: '#141414', borderColor: '#303030' }}
          >
            <div style={{ 
              background: '#1f1f1f', 
              padding: 16, 
              borderRadius: 8,
              fontFamily: 'monospace'
            }}>
              <pre style={{ margin: 0, color: '#52c41a' }}>
{`root
├── spine (x: 0.00, y: 100.00)
│   ├── chest (x: 0.00, y: 50.00)
│   └── head (x: 0.00, y: 75.00)
└── hips (x: 0.00, y: 0.00)
    ├── leg_left (x: -25.00, y: -50.00)
    └── leg_right (x: 25.00, y: -50.00)`}
              </pre>
            </div>
          </Card>

          <Alert
            message={<Text style={{ color: '#fff' }}>Bone Structure Notes</Text>}
            description={
              <Space direction="vertical">
                <Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>• Each bone requires matrix computations every frame</Text>
                <Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>• Deep hierarchies increase transformation complexity exponentially</Text>
                <Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>• Keep bone hierarchies under 5 levels deep when possible</Text>
              </Space>
            }
            type="info"
            showIcon
            style={{ background: '#1f1f1f', borderColor: '#303030' }}
          />
        </Space>
      </div>
    );
  };

  const tabs = [
    {
      key: 'summary',
      label: 'Summary',
      children: renderSummaryTab(),
    },
    {
      key: 'meshAnalysis',
      label: 'Mesh Analysis',
      children: renderMeshAnalysisTab(),
    },
    {
      key: 'clippingAnalysis',
      label: 'Clipping',
      children: renderClippingTab(),
    },
    {
      key: 'blendModeAnalysis',
      label: 'Blend Modes',
      children: renderBlendModesTab(),
    },
    {
      key: 'skeletonTree',
      label: 'Skeleton Tree',
      children: renderSkeletonTreeTab(),
    },
  ];
  
  return (
    <Tabs 
      activeKey={activeTab} 
      onChange={setActiveTab}
      items={tabs}
      style={{ height: '100%' }}
      tabBarStyle={{ color: '#fff' }}
    />
  );
};