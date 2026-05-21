import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, Alert, FlatList, Modal, Switch, Dimensions } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Types
interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  tags: string[];
  notes: string;
}

interface MoodEntry {
  id: string;
  mood: string;
  notes: string;
  time: string;
}

// DBT Skills Data
const DBT_SKILLS = {
  distress: {
    title: 'Distress Tolerance',
    emoji: '🌡️',
    skills: [
      { name: 'TIPP', desc: 'Temperature change, Intense exercise, Paced breathing, Paired muscle relaxation' },
      { name: 'Self-Soothe', desc: 'Use 5 senses: sight, sound, touch, smell, taste to ground yourself' },
      { name: 'Pros/Cons', desc: 'List pros and cons of acting impulsively vs riding the wave' },
      { name: 'IMPROVE', desc: 'Imagery, Meaning, Prayer, Relaxation, One thing, Vacant mind, Expression' }
    ]
  },
  emotion: {
    title: 'Emotion Regulation',
    emoji: '🎭',
    skills: [
      { name: 'Name the Emotion', desc: 'Label exactly what you feel: "I feel ashamed" not "bad"' },
      { name: 'Check Facts', desc: 'Ask: What emotion? What supports this? What doesnt?' },
      { name: 'Opposite Action', desc: 'Act opposite to urges. Hide? Go toward instead.' },
      { name: 'Accumulate Positives', desc: 'Small pleasant things build good feelings' }
    ]
  },
  mindfulness: {
    title: 'Mindfulness',
    emoji: '🧘',
    skills: [
      { name: 'What', desc: 'Notice whats happening right now without judgment' },
      { name: 'How', desc: 'Observe without acting. Notice without controlling.' },
      { name: 'Wise Mind', desc: 'Balance between emotion and reasonable mind' },
      { name: 'Non-Judgmental', desc: 'Describe without evaluating "Rain fell" not "bad weather"' }
    ]
  },
  interpersonal: {
    title: 'Interpersonal',
    emoji: '🤝',
    skills: [
      { name: 'DEAR MAN', desc: 'Describe, Express, Assert, Reinforce, Mindful, Appear confident, Negotiate' },
      { name: 'GIVE', desc: 'Gentle, Interested, Validate, Easy manner' },
      { name: 'FAST', desc: 'Fair, no Apologies, Stick to values, Truthful' },
      { name: 'Effectiveness', desc: 'Will this keep the relationship? Work long-term?' }
    ]
  }
};

// Generate unique ID
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

// Storage helpers
const STORAGE_KEY = 'ContactVWellness';
const loadData = () => {
  try {
    const data = require('react-native').AsyncStorage?.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : { contacts: [], moods: [], settings: {} };
  } catch { return { contacts: [], moods: [], settings: {} }; }
};

const saveData = (data: any) => {
  try {
    require('react-native').AsyncStorage?.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
};

// Main App
export default function App() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [moods, setMoods] = useState<MoodEntry[]>([]);
  const [tab, setTab] = useState('contacts');
  const [modal, setModal] = useState<string | null>(null);

  // Contact form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');

  // Mood state
  const [moodSelect, setMoodSelect] = useState('');
  const [moodNotes, setMoodNotes] = useState('');

  // Chat state
  const [chatMessages, setChatMessages] = useState<{role: string; text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');

  // Load data on mount
  useEffect(() => {
    // Initialize chat greeting
    setChatMessages([{ role: 'bot', text: 'Hello! Im your DBT wellness coach. How are you feeling?' }]);
  }, []);

  const saveContact = () => {
    if (!firstName.trim() || !email.trim()) {
      Alert.alert('Error', 'First name and email required');
      return;
    }
    const contact: Contact = {
      id: editingId || generateId(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      company: company.trim(),
      tags: [],
      notes: ''
    };
    
    if (editingId) {
      setContacts(contacts.map(c => c.id === editingId ? contact : c));
    } else {
      setContacts([...contacts, contact]);
    }
    
    resetForm();
    setModal(null);
  };

  const resetForm = () => {
    setEditingId(null);
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setCompany('');
  };

  const editContact = (id: string) => {
    const c = contacts.find(x => x.id === id);
    if (c) {
      setEditingId(id);
      setFirstName(c.firstName);
      setLastName(c.lastName);
      setEmail(c.email);
      setPhone(c.phone);
      setCompany(c.company);
      setModal('contact');
    }
  };

  const deleteContact = (id: string) => {
    Alert.alert('Delete', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => setContacts(contacts.filter(c => c.id !== id)) }
    ]);
  };

  const logMood = () => {
    if (!moodSelect) {
      Alert.alert('Error', 'Select a mood');
      return;
    }
    setMoods([{ id: generateId(), mood: moodSelect, notes: moodNotes, time: new Date().toISOString() }, ...moods]);
    setMoodSelect('');
    setMoodNotes('');
  };

  const generateResponse = (msg: string): string => {
    const m = msg.toLowerCase();
    if (m.includes('suicide') || m.includes('die') || m.includes('hurt')) {
      return 'Your life matters. Call 988 Suicide & Crisis Lifeline. Text HOME to 741741.';
    }
    if (m.includes('anxious') || m.includes('stress') || m.includes('overwhelmed')) {
      return 'Lets try 5-4-3-2-1: 5 things you SEE, 4 TOUCH, 3 HEAR, 2 SMELL, 1 TASTE. Stay present.';
    }
    if (m.includes('sad') || m.includes('depressed') || m.includes('hopeless')) {
      return 'I hear you. What tiny thing could bring relief today? Even fresh air counts.';
    }
    if (m.includes('angry') || m.includes('mad')) {
      return 'Anger is valid. Take a breath. What feeling is underneath? We can use TIPP.';
    }
    if (m.includes('lonely') || m.includes('alone')) {
      return 'Consider reaching out to someone. Or join a support group.';
    }
    if (m.includes('thank') || m.includes('grateful')) {
      return 'Noticing positives builds resilience. What else felt okay today?';
    }
    return 'I hear you. What do you notice in your body right now? Take a breath.';
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    setChatMessages([...chatMessages, { role: 'user', text: chatInput }]);
    setChatInput('');
    setTimeout(() => {
      setChatMessages(prev => [...prev, { role: 'bot', text: generateResponse(chatInput) }]);
    }, 800);
  };

  const showSkill = (type: string) => (
    <ScrollView style={styles.content}>
      <TouchableOpacity style={styles.card} onPress={() => setTab('wellness')}>
        <Text style={styles.backBtn}>← Back</Text>
      </TouchableOpacity>
      <View style={[styles.header, { backgroundColor: '#22c55e' }]}>
        <Text style={styles.headerTitle}>{DBT_SKILLS[type as keyof typeof DBT_SKILLS].emoji}</Text>
        <Text style={styles.headerSubtitle}>{DBT_SKILLS[type as keyof typeof DBT_SKILLS].title}</Text>
      </View>
      {DBT_SKILLS[type as keyof typeof DBT_SKILLS].skills.map(skill => (
        <View key={skill.name} style={styles.card}>
          <Text style={styles.skillName}>{skill.name}</Text>
          <Text style={styles.skillDesc}>{skill.desc}</Text>
        </View>
      ))}
    </ScrollView>
  );

  const renderContacts = () => (
    <FlatList
      data={contacts}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.contactCard} onPress={() => editContact(item.id)} onLongPress={() => deleteContact(item.id)}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{item.firstName[0]}{(item.lastName || '')[0]}</Text></View>
          <View style={styles.contactInfo}>
            <Text style={styles.contactName}>{item.firstName} {item.lastName}</Text>
            <Text style={styles.contactEmail}>{item.email}</Text>
          </View>
        </TouchableOpacity>
      )}
      ListEmptyComponent={<View style={styles.empty}><Text>No contacts yet</Text></View>}
    />
  );

  const renderMoods = () => (
    <FlatList
      data={moods}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <View style={styles.moodRow}>
          <Text style={styles.moodEmoji}>{item.mood === 'great' ? '😊' : item.mood === 'good' ? '🙂' : item.mood === 'okay' ? '😐' : item.mood === 'low' ? '😔' : '😢'}</Text>
          <Text style={styles.moodText}>{item.mood}</Text>
        </View>
      )}
      ListEmptyComponent={<View style={styles.empty}><Text>No moods logged</Text></View>}
    />
  );

  const renderChat = () => (
    <View style={styles.chatContainer}>
      <FlatList
        data={chatMessages}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item }) => (
          <View style={[styles.msg, item.role === 'user' ? styles.msgUser : styles.msgBot]}>
            <Text style={item.role === 'user' ? styles.msgTextUser : styles.msgTextBot}>{item.text}</Text>
          </View>
        )}
      />
      <View style={styles.chatInput}>
        <TextInput style={styles.input} value={chatInput} onChangeText={setChatInput} placeholder="Share what's on your mind..." />
        <TouchableOpacity style={styles.sendBtn} onPress={sendChat}><Text style={styles.sendText}>Send</Text></TouchableOpacity>
      </View>
    </View>
  );

  // Render current tab
  const renderContent = () => {
    switch(tab) {
      case 'contacts':
        return (
          <View style={styles.container}>
            <TextInput style={styles.search} placeholder="🔍 Search contacts..." placeholderTextColor="#94a3b8" />
            {renderContacts()}
            <TouchableOpacity style={styles.fab} onPress={() => setModal('contact')}><Text style={styles.fabText}>+</Text></TouchableOpacity>
          </View>
        );
      case 'wellness':
        return (
          <ScrollView style={styles.content}>
            <View style={[styles.header, { backgroundColor: '#22c55e' }]}>
              <Text style={styles.headerTitle}>💚 Wellness Coach</Text>
              <Text style={styles.headerSubtitle}>DBT-powered AI companion</Text>
            </View>
            
            <TouchableOpacity style={styles.card} onPress={() => setTab('chat')}>
              <Text style={styles.cardTitle}>🗣️ Chat with Coach</Text>
              <Text style={styles.cardDesc}>Talk to an AI wellness coach</Text>
            </TouchableOpacity>
            
            <Text style={styles.sectionTitle}>Core DBT Skills</Text>
            <View style={styles.grid}>
              {Object.entries(DBT_SKILLS).map(([key, val]) => (
                <TouchableOpacity key={key} style={styles.skillCard} onPress={() => setTab(key)}>
                  <Text style={styles.skillEmoji}>{val.emoji}</Text>
                  <Text style={styles.skillLabel}>{val.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <Text style={styles.sectionTitle}>Mood Tracker</Text>
            <View style={styles.card}>
              <Text style={styles.label}>How are you feeling?</Text>
              <View style={styles.moodBtns}>
                {['great', 'good', 'okay', 'low', 'bad'].map(m => (
                  <TouchableOpacity key={m} style={[styles.moodBtn, moodSelect === m && styles.moodBtnActive]} onPress={() => setMoodSelect(m)}>
                    <Text>{m === 'great' ? '😊' : m === 'good' ? '🙂' : m === 'okay' ? '😐' : m === 'low' ? '😔' : '😢'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput style={styles.input} value={moodNotes} onChangeText={setMoodNotes} placeholder="What's on your mind?" multiline />
              <TouchableOpacity style={styles.btn} onPress={logMood}><Text style={styles.btnText}>Log Mood</Text></TouchableOpacity>
            </View>
            
            <Text style={styles.sectionTitle}>Your Journey</Text>
            {renderMoods()}
            
            <View style={[styles.card, { backgroundColor: '#fefce8' }]}>
              <Text style={styles.crisisTitle}>🆘 Crisis Resources</Text>
              <Text style={styles.crisisText}>Call 988 Suicide & Crisis Lifeline</Text>
              <Text style={styles.crisisText}>Text HOME to 741741</Text>
            </View>
          </ScrollView>
        );
      case 'chat':
        return renderChat();
      default:
        if (DBT_SKILLS[tab as keyof typeof DBT_SKILLS]) return showSkill(tab);
        return null;
    }
  };

  return (
    <View style={styles.app}>
      {/* Header */}
      <View style={styles.appHeader}>
        <Text style={styles.appTitle}>📇 ContactV Wellness</Text>
        <TouchableOpacity onPress={() => setTab('settings')}><Text>⚙️</Text></TouchableOpacity>
      </View>
      
      {/* Tabs */}
      <View style={styles.tabs}>
        {[
          { key: 'contacts', label: 'Contacts' },
          { key: 'wellness', label: '💚 Wellness' },
          { key: 'chat', label: 'Chat' }
        ].map(t => (
          <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      
      {/* Content */}
      {renderContent()}
      
      {/* Contact Modal */}
      <Modal visible={modal === 'contact'} animationType="slide">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setModal(null); resetForm(); }}><Text style={styles.closeBtn}>×</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>{editingId ? 'Edit' : 'Add'} Contact</Text>
            <View />
          </View>
          <ScrollView>
            <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="First Name *" />
            <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="Last Name" />
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email *" keyboardType="email-address" />
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone" keyboardType="phone-pad" />
            <TextInput style={styles.input} value={company} onChangeText={setCompany} placeholder="Company" />
            <TouchableOpacity style={styles.btn} onPress={saveContact}><Text style={styles.btnText}>Save Contact</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: '#f8fafc' },
  appHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#2563eb', paddingTop: 48 },
  appTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  
  tabs: { flexDirection: 'row', backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  tab: { flex: 1, padding: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#2563eb' },
  tabText: { fontSize: 14, color: '#64748b' },
  tabTextActive: { color: '#2563eb', fontWeight: '600' },
  
  container: { flex: 1, padding: 16 },
  content: { flex: 1, padding: 16 },
  search: { backgroundColor: 'white', padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 15 },
  
  header: { padding: 24, borderRadius: 12, marginBottom: 16, alignItems: 'center' },
  headerTitle: { fontSize: 22, color: 'white', fontWeight: 'bold' },
  headerSubtitle: { color: 'rgba(255,255,255,0.9)', marginTop: 4 },
  
  card: { backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardDesc: { color: '#64748b', fontSize: 14, marginTop: 4 },
  
  sectionTitle: { fontSize: 16, fontWeight: '600', marginVertical: 12 },
  
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  skillCard: { width: '48%', backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 12, alignItems: 'center' },
  skillEmoji: { fontSize: 24 },
  skillLabel: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  
  label: { fontSize: 13, color: '#64748b', marginBottom: 8 },
  moodBtns: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 },
  moodBtn: { padding: 12, borderRadius: 8, backgroundColor: '#f1f5f9' },
  moodBtnActive: { backgroundColor: '#dbeafe' },
  
  input: { backgroundColor: 'white', padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 15, borderWidth: 1, borderColor: '#e2e8f0' },
  
  btn: { backgroundColor: '#2563eb', padding: 14, borderRadius: 8, alignItems: 'center' },
  btnText: { color: 'white', fontWeight: '600' },
  
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' },
  fabText: { color: 'white', fontSize: 28 },
  
  contactCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 12, borderRadius: 12, marginBottom: 8 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: 'white', fontSize: 18, fontWeight: '600' },
  contactInfo: { marginLeft: 12, flex: 1 },
  contactName: { fontSize: 15, fontWeight: '500' },
  contactEmail: { fontSize: 13, color: '#64748b' },
  
  empty: { alignItems: 'center', padding: 40 },
  
  modal: { flex: 1, backgroundColor: '#f8fafc', paddingTop: 48 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  closeBtn: { fontSize: 28 },
  modalTitle: { fontSize: 18, fontWeight: '600' },
  
  chatContainer: { flex: 1, padding: 16 },
  msg: { padding: 12, borderRadius: 12, marginBottom: 8, maxWidth: '80%' },
  msgUser: { backgroundColor: '#2563eb', alignSelf: 'flex-end' },
  msgBot: { backgroundColor: '#f0fdf4', alignSelf: 'flex-start' },
  msgTextUser: { color: 'white' },
  msgTextBot: { color: '#1e293b' },
  chatInput: { flexDirection: 'row', padding: 12, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  sendBtn: { backgroundColor: '#2563eb', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, marginLeft: 8 },
  sendText: { color: 'white', fontWeight: '600' },
  
  moodRow: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: 'white', borderRadius: 8, marginBottom: 8 },
  moodEmoji: { fontSize: 24, marginRight: 12 },
  moodText: { textTransform: 'capitalize' },
  
  skillName: { color: '#2563eb', fontWeight: '600' },
  skillDesc: { fontSize: 14, color: '#64748b', marginTop: 4 },
  
  backBtn: { color: '#2563eb', fontSize: 16, marginBottom: 16 },
  
  crisisTitle: { fontWeight: '600', marginBottom: 8 },
  crisisText: { fontSize: 14, color: '#64748b' },
});