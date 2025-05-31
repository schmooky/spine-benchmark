import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { Card, Typography, Progress, Tag, Table, Space, Row, Col, Empty, Slider, Tooltip } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface EventTimelineProps {
  spineInstance: Spine;
  currentAnimation: string;
}

interface AnimationEvent {
  name: string;
  time: number;
  value: string | number | boolean | object | null;
  valueType: 'string' | 'number' | 'boolean' | 'object' | 'default';
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  string: 'green',
  number: 'blue',
  boolean: 'orange',
  object: 'purple',
  default: 'default'
};

const EventTimeline: React.FC<EventTimelineProps> = ({ spineInstance, currentAnimation }) => {
  const { t } = useTranslation();
  const [events, setEvents] = useState<AnimationEvent[]>([]);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!spineInstance || !currentAnimation) return;
    
    const animation = spineInstance.skeleton.data.findAnimation(currentAnimation);
    if (!animation) return;

    setDuration(animation.duration);
    
    const extractedEvents: AnimationEvent[] = [];
    
    animation.timelines.forEach((timeline: any) => {
      if (timeline.events) {
        timeline.events.forEach((evt: any) => {
          const value = evt.data.stringValue || evt.data.intValue || evt.data.floatValue || evt.data.audioPath || null;
          let valueType: AnimationEvent['valueType'] = 'default';
          
          if (typeof value === 'string') valueType = 'string';
          else if (typeof value === 'number') valueType = 'number';
          else if (typeof value === 'boolean') valueType = 'boolean';
          else if (typeof value === 'object' && value !== null) valueType = 'object';
          
          extractedEvents.push({
            name: evt.data.name,
            time: evt.time,
            value: value,
            valueType: valueType
          });
        });
      }
    });
    
    extractedEvents.sort((a, b) => a.time - b.time);
    setEvents(extractedEvents);
  }, [spineInstance, currentAnimation]);

  useEffect(() => {
    if (!spineInstance || !currentAnimation) return;

    let lastTime = 0;
    
    const updateAnimation = (time: number) => {
      if (!lastTime) {
        lastTime = time;
        animationFrameRef.current = requestAnimationFrame(updateAnimation);
        return;
      }

      if (isPlaying && spineInstance && spineInstance.state) {
        const track = spineInstance.state.tracks[0];
        if (track) {
          const animationTime = track.getAnimationTime();
          setCurrentTime(animationTime);
        }
      }
      
      animationFrameRef.current = requestAnimationFrame(updateAnimation);
    };
    
    animationFrameRef.current = requestAnimationFrame(updateAnimation);
    
    const listener = {
      start: (entry: any) => {
        if (entry.animation.name === currentAnimation) {
          setIsPlaying(true);
        }
      },
      complete: (entry: any) => {
        if (entry.animation.name === currentAnimation) {
          setIsPlaying(false);
        }
      },
      event: (entry: any, event: any) => {
        console.log('Event fired:', event.data.name, event.time, event.data);
      }
    };
    
    spineInstance.state.addListener(listener);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      spineInstance.state.removeListener(listener);
    };
  }, [spineInstance, currentAnimation, isPlaying]);

  const handleSliderChange = (value: number) => {
    if (!spineInstance || !currentAnimation) return;
    
    const targetTime = (value / 100) * duration;
    const track = spineInstance.state.setAnimation(0, currentAnimation, false);
    if (track) {
      track.trackTime = targetTime;
      setCurrentTime(targetTime);
    }
  };

  const formatTime = (time: number) => {
    return time.toFixed(2) + 's';
  };

  const columns = [
    {
      title: <Text style={{ color: '#fff' }}>{t('drawer.time')}</Text>,
      dataIndex: 'time',
      key: 'time',
      width: 100,
      render: (time: number) => (
        <Tag color={currentTime >= time && currentTime < time + 0.1 ? 'blue' : 'default'}>
          {formatTime(time)}
        </Tag>
      ),
    },
    {
      title: <Text style={{ color: '#fff' }}>{t('drawer.name')}</Text>,
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text style={{ color: '#fff' }}>{name}</Text>,
    },
    {
      title: <Text style={{ color: '#fff' }}>{t('drawer.type')}</Text>,
      dataIndex: 'valueType',
      key: 'valueType',
      width: 100,
      render: (type: string) => (
        <Tag color={EVENT_TYPE_COLORS[type] || 'default'}>
          {type}
        </Tag>
      ),
    },
    {
      title: <Text style={{ color: '#fff' }}>{t('drawer.value')}</Text>,
      dataIndex: 'value',
      key: 'value',
      render: (value: any) => (
        <Text code={value !== null} style={{ color: value !== null ? '#52c41a' : '#fff' }}>
          {value !== null ? String(value) : '-'}
        </Text>
      ),
    },
  ];

  if (!currentAnimation) {
    return (
      <Empty 
        description={<Text style={{ color: 'rgba(255, 255, 255, 0.45)' }}>{t('drawer.noAnimationSelected')}</Text>}
        style={{ marginTop: 48 }}
      />
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%', padding: 24 }}>
      <Card style={{ background: '#141414', borderColor: '#303030' }}>
        <Row gutter={24} align="middle">
          <Col span={16}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Title level={4} style={{ margin: 0, color: '#fff' }}>
                {isPlaying ? <PlayCircleOutlined /> : <PauseCircleOutlined />} {currentAnimation}
              </Title>
              <Slider
                value={(currentTime / duration) * 100}
                onChange={handleSliderChange}
                tooltip={{
                  formatter: (value) => value ? formatTime((value / 100) * duration) : '0s'
                }}
                marks={events.reduce((acc, evt) => {
                  const percent = (evt.time / duration) * 100;
                  acc[percent] = {
                    style: { color: '#fff' },
                    label: <Tooltip title={evt.name}><div style={{ width: 2, height: 16, background: '#1890ff' }} /></Tooltip>
                  };
                  return acc;
                }, {} as any)}
                style={{ margin: '20px 0' }}
              />
            </Space>
          </Col>
          <Col span={8}>
            <Space direction="vertical" align="center" style={{ width: '100%' }}>
              <Text style={{ color: '#fff', fontSize: 24, fontFamily: 'monospace' }}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </Text>
              <Progress 
                type="circle" 
                percent={Math.round((currentTime / duration) * 100)} 
                size={80}
                format={() => (
                  <Text style={{ color: '#fff' }}>{Math.round((currentTime / duration) * 100)}%</Text>
                )}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      <Card 
        title={<Text style={{ color: '#fff' }}>{t('drawer.events')} ({events.length})</Text>}
        style={{ background: '#141414', borderColor: '#303030' }}
        bodyStyle={{ padding: 0 }}
      >
        {events.length > 0 ? (
          <Table
            columns={columns}
            dataSource={events}
            rowKey={(record) => `${record.name}-${record.time}`}
            pagination={false}
            size="small"
            style={{ background: '#141414' }}
            rowClassName={(record) => 
              currentTime >= record.time && currentTime < record.time + 0.1 ? 'active-event' : ''
            }
          />
        ) : (
          <Empty 
            description={<Text style={{ color: 'rgba(255, 255, 255, 0.45)' }}>{t('drawer.noEvents')}</Text>}
            style={{ padding: 24 }}
          />
        )}
      </Card>

      <Card style={{ background: '#141414', borderColor: '#303030' }}>
        <Title level={5} style={{ color: '#fff' }}>{t('drawer.eventTypeLegend')}</Title>
        <Space wrap>
          {Object.entries(EVENT_TYPE_COLORS).map(([type, color]) => (
            <Tag key={type} color={color}>
              {type}
            </Tag>
          ))}
        </Space>
      </Card>
    </Space>
  );
};

export default EventTimeline;