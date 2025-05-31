import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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

  const getScoreRating = (score: number): string => {
    if (score >= 85) return t('performance.excellent');
    if (score >= 70) return t('performance.good');
    if (score >= 55) return t('performance.moderate');
    return t('performance.poor');
  };

  const getScoreInterpretation = (score: number): string => {
    if (score >= 85) return t('interpretation.excellent');
    if (score >= 70) return t('interpretation.good');
    if (score >= 55) return t('interpretation.moderate');
    return t('interpretation.poor');
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
                title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>{t('performance.overallScore')}</Text>}
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
                  {getScoreRating(overallScore)} {t('performance.performance')}
                </Tag>
                <Text type="secondary" style={{ color: 'rgba(255, 255, 255, 0.65)' }}>
                  {getScoreInterpretation(overallScore)}
                </Text>
              </Space>
            </Col>
          </Row>
        </Card>

        <Title level={4} style={{ color: '#fff', marginBottom: 16 }}>
          <InfoCircleOutlined /> {t('performance.componentScores')}
        </Title>
        
        <Row gutter={[16, 16]}>
          <Col span={12}>
            <Card 
              size="small" 
              style={{ background: '#1f1f1f', borderColor: '#303030' }}
              bodyStyle={{ padding: 16 }}
            >
              <Statistic
                title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>{t('performance.boneStructure')}</Text>}
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
                title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>{t('performance.meshComplexity')}</Text>}
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
                title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>{t('performance.clippingMasks')}</Text>}
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
                title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>{t('performance.blendModes')}</Text>}
                value={65}
                suffix={<Text style={{ color: '#faad14', fontSize: 16 }}>%</Text>}
                valueStyle={{ color: '#faad14', fontSize: 24 }}
              />
            </Card>
          </Col>
        </Row>

        <Alert
          message={<Text style={{ color: '#fff' }}>{t('optimization.title')}</Text>}
          description={
            <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
              <li><Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>{t('optimization.tips.reduceBlendModes')}</Text></li>
              <li><Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>{t('optimization.tips.simplifyComplexMasks')}</Text></li>
              <li><Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>{t('optimization.tips.optimizePathConstraints')}</Text></li>
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
        title: <Text style={{ color: '#fff' }}>{t('details.slot')}</Text>,
        dataIndex: 'slot',
        key: 'slot',
        render: (text: string) => <Text style={{ color: '#fff' }}>{text}</Text>,
      },
      {
        title: <Text style={{ color: '#fff' }}>{t('details.vertices')}</Text>,
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
        title: <Text style={{ color: '#fff' }}>{t('details.deformed')}</Text>,
        dataIndex: 'deformed',
        key: 'deformed',
        render: (deformed: boolean) => (
          <Tag color={deformed ? 'warning' : 'default'}>
            {deformed ? t('details.yes') : t('details.no')}
          </Tag>
        ),
      },
      {
        title: <Text style={{ color: '#fff' }}>{t('details.boneWeights')}</Text>,
        dataIndex: 'boneWeights',
        key: 'boneWeights',
        render: (weights: number) => <Text style={{ color: '#fff' }}>{weights}</Text>,
      },
      {
        title: <Text style={{ color: '#fff' }}>{t('details.hasParentMesh')}</Text>,
        dataIndex: 'hasParent',
        key: 'hasParent',
        render: (hasParent: boolean) => (
          <Tag color={hasParent ? 'blue' : 'default'}>
            {hasParent ? t('details.yes') : t('details.no')}
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
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>{t('stats.totalMeshes')}</Text>}
                  value={4} 
                  valueStyle={{ color: '#fff' }}
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>{t('stats.totalVertices')}</Text>}
                  value={294} 
                  valueStyle={{ color: '#fff' }}
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>{t('details.deformed')} {t('stats.totalMeshes')}</Text>}
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
        title: <Text style={{ color: '#fff' }}>{t('details.slot')}</Text>,
        dataIndex: 'slot',
        key: 'slot',
        render: (text: string) => <Text style={{ color: '#fff' }}>{text}</Text>,
      },
      {
        title: <Text style={{ color: '#fff' }}>{t('details.vertices')}</Text>,
        dataIndex: 'vertices',
        key: 'vertices',
        render: (vertices: number) => (
          <Tag color={vertices <= 4 ? 'success' : vertices <= 8 ? 'warning' : 'error'}>
            {vertices}
          </Tag>
        ),
      },
      {
        title: <Text style={{ color: '#fff' }}>{t('details.status')}</Text>,
        dataIndex: 'status',
        key: 'status',
        render: (status: string) => {
          const color = status === 'optimal' ? 'success' : status === 'acceptable' ? 'warning' : 'error';
          const icon = status === 'optimal' ? <CheckCircleOutlined /> : <WarningOutlined />;
          const statusText = status === 'optimal' ? t('details.optimal') : t('details.acceptable');
          return <Tag color={color} icon={icon}>{statusText}</Tag>;
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
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>{t('stats.totalVertices')}</Text>}
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
            title={<Text style={{ color: '#fff' }}>{t('optimization.title')}</Text>}
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

  const tabs = [
    {
      key: 'summary',
      label: t('analysis.summary'),
      children: renderSummaryTab(),
    },
    {
      key: 'meshAnalysis',
      label: t('analysis.meshAnalysis'),
      children: renderMeshAnalysisTab(),
    },
    {
      key: 'clippingAnalysis',
      label: t('analysis.clipping'),
      children: renderClippingTab(),
    },
    {
      key: 'blendModeAnalysis',
      label: t('analysis.blendModes'),
      children: <div style={{ padding: 24 }}><Text style={{ color: '#fff' }}>Blend Modes Analysis Content</Text></div>,
    },
    {
      key: 'skeletonTree',
      label: t('analysis.skeletonTree'),
      children: <div style={{ padding: 24 }}><Text style={{ color: '#fff' }}>Skeleton Tree Content</Text></div>,
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