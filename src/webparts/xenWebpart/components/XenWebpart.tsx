  /* eslint-disable @rushstack/no-new-null */
  /* eslint-disable @typescript-eslint/no-explicit-any */
  /* eslint-disable @typescript-eslint/explicit-function-return-type */
  /* eslint-disable react/self-closing-comp */
  /* eslint-disable @typescript-eslint/no-floating-promises */
  import * as React from 'react';  
  import { Spinner, Button, Form } from 'react-bootstrap';  
  import axios from 'axios';  
  import DOMPurify from 'dompurify';  
  import styles from './XenWebpart.module.scss';  
  import { IXenWebpartProps } from './IXenWebpartProps';  
 
 
  // Define the state interface
  interface IXenWebpartState {
    input: string;
    messages: Array<{ role: string; content: string; documents?: any[] }>;
    status: string | null;
  }
 
  export default class XenWebpart extends React.Component<IXenWebpartProps, IXenWebpartState> {
    private messagesEndRef: React.RefObject<HTMLDivElement>;
 
    constructor(props: IXenWebpartProps) {
      super(props);
      this.state = {
        input: '',
        messages: [],
        status: ''
      };
      this.messagesEndRef = React.createRef();
    }
 
    componentDidUpdate() {
      this.messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
 
    processMessage = async (query: string) => {
      const AZURE_OPENAI_ENDPOINT = '';
      const AZURE_OPENAI_KEY = '';
      const MODEL_NAME = '';
 
      try {  
        this.setState({ status: 'analyzing' });  
        this.setState((prevState) => ({  
          messages: [...prevState.messages, { role: 'user', content: query }],  
        }));  
   
        const systemMessage = {
          role: 'system',
          content: `
          Get the answer for the user's question using the provided data source.
          Format responses using HTML with these guidelines:
          - Use <div class="answer-section"> as the main container.
          - Headings: <h3 class="answer-heading">.
          -Provide answers to the question in a neat manner and be more sharp and crisp in answering the questions.
          - Lists: <ul class="document-list"> with <li class="document-item"> always try to bold the files names.
          Do not prvoide the link instead say where the files are located like which drive under is there and file name and its respective drive name and site name if available do nto provide the link for the files and folder.
 
          If the question relates to files, state that a list of relevant files and their locations is available.`
        };
   
        // Phase 1: Analyze query and search documents  
        const analysisResponse = await axios.post(  
          `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${MODEL_NAME}/chat/completions?api-version=2024-02-15-preview`,  
          {  
            messages: [systemMessage, { role: 'user', content: query }],  
            tools: [  
              {  
                type: 'function',  
                function: {  
                  name: 'search_documents',  
                  description: 'Search organizational documents',  
                  parameters: {  
                    type: 'object',  
                    properties: {  
                      queryString: { type: 'string' },  
                    },  
                    required: ['queryString'],  
                  },  
                },  
              },  
            ],  
            tool_choice: 'auto',  
          },  
          { headers: { 'api-key': AZURE_OPENAI_KEY } }  
        );  
   
        let documents: any[] = [];  
        const toolCall = analysisResponse.data.choices[0]?.message?.tool_calls?.[0];  
       
        if (toolCall?.function.name === 'search_documents') {  
          this.setState({ status: 'searching' });  
          const { queryString } = JSON.parse(toolCall.function.arguments);  
          const client = await this.props.context.msGraphClientFactory.getClient("3");
          const searchResponse =  await client
          .api('/search/query')
          .post({
            requests: [
              {
                entityTypes: ["driveItem"],
                query: {
                  queryString
                },
                size: 5
              }
            ]
          });
          const items =  searchResponse.value[0].hitsContainers[0].hits;  
          documents = items.map((hit: any) => ({  
            name: hit.resource.name,  
            type: hit.resource.file?.mimeType || 'Unknown',  
            path: hit.resource.parentReference?.path || '/',  
            url: hit.resource.webUrl,  
            lastModified: new Date(hit.resource.lastModifiedDateTime).toLocaleString(),  
          }));  
         
          this.setState({ status: 'processing' });  
        }  
   
        this.setState({ status: 'generating' });  
        const completionResponse = await axios.post(
          `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${MODEL_NAME}/chat/completions?api-version=2024-02-15-preview`,
          {
            messages: [
              systemMessage,
              { role: 'user', content: query },
              {
                role: 'system',
                content: `Use the following document data to answer the user's question:\n${JSON.stringify(documents)} and provide the links till the user asks for the path and url for files and jus asy him the related files are below.`,
              },
              {
                role: 'system',
                content: JSON.stringify({
                  data_sources: [
                    {
                      type: "azure_search",
                      parameters: {
                        endpoint: "",
                        index_name: "",
                        semantic_configuration: "",
                        query_type: "semantic",
                        fields_mapping: {},
                        in_scope: true,
                        role_information: "You are an AI assistant that helps people find information.",
                        filter: null,
                        strictness: 3,
                        top_n_documents: 5,
                        authentication: {
                          type: "api_key",
                          key: ""
                        }
                      }
                    }
                  ]
                }),
              }
            ],
            max_tokens: 1000,
          },
          { headers: { 'api-key': AZURE_OPENAI_KEY } }
        );
        const sanitizedContent = DOMPurify.sanitize(completionResponse.data.choices[0].message.content);  
        this.setState((prevState) => ({  
          messages: [  
            ...prevState.messages,  
            { role: 'assistant', content: sanitizedContent, documents },  
          ],  
        }));  
      } catch (error) {  
        console.error('Processing Error:', error);  
      } finally {  
        this.setState({ status: null });  
      }  
    };  
   
    copyToClipboard = (text: string) => {  
      navigator.clipboard.writeText(text).catch((err) => console.error('Failed to copy text:', err));  
    };  
   
    getFileIcon = (mimeType: string) => {  
      const typeMap: Record<string, string> = {  
        'application/pdf': '📄',  
        'text/plain': '📝',  
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📑',  
        'application/vnd.ms-excel': '📊',  
        'image/': '🖼️',  
        default: '📁',  
      };  
      return Object.entries(typeMap).find(([key]: any) => mimeType?.includes(key))?.[1] || typeMap.default;  
    };  
   
    render() {  
      const { input, messages, status } = this.state;  
      const statusMessages: any = {  
        analyzing: 'Analyzing your question...',  
        searching: 'Searching across repositories...',  
        processing: 'Processing relevant files...',  
        generating: 'Formulating response...',  
      };  
   
      return (  
        <div className={styles.appContainer}>  
          <header className={styles.appHeader}>  
            <h2>Enterprise Knowledge Assistant</h2>  
            <p>AI-powered document intelligence with verified sources</p>  
          </header>  
   
          <div className={styles.chatContainer}>  
            <div className={styles.messagesContainer}>  
              {messages  
                .filter((m) => m.role !== 'system')  
                .map((message, index) => (  
                  <div key={index} className={`${styles.message} ${message.role === 'user' ? styles.user : ''}`}>  
                    {message.role === 'user' ? (  
                      <div className={styles.userQuestion}>{message.content}</div>  
                    ) : (  
                      <div className={styles.aiResponse} dangerouslySetInnerHTML={{ __html: message.content }} />  
                    )}  
                    {(message.documents ?? []).length > 0 && (  
                      <div className={styles.documentsGrid}>  
                      <div>The documents found are listed below:</div>
                      <br />
                        {(message.documents ?? []).map((doc, i) => (  
                         
                          <div key={i} className={styles.documentCard}>  
                           
                            <div className={styles.documentHeader}>  
                              <span className={styles.fileIcon}>{this.getFileIcon(doc.type)}</span>  
                              <div className={styles.documentActions}>  
                              <div className={styles.tooltipContainer}>
                              <button  
                                    className={styles.actionButton}  
                                    onClick={() => window.open(doc.url, '_blank')}  
                                    aria-label={`Open link`}  
                                  >  
                                    ↗  
                                    <span className={styles.tooltip}>Open {doc.name} in new tab</span>
                                  </button>
                               </div>
                               <div className={styles.tooltipContainer}>
                                    <button  
                                      className={styles.actionButton}  
                                      onClick={() => this.copyToClipboard(doc.url)}  
                                      aria-label={`Copy link`}  
                                    >  
                                      ⎘  
                                      <span className={styles.tooltip}>Copy link to {doc.name}</span>
                                    </button>
                                  </div>
                              </div>  
                            </div>  
                            <div className={styles.documentInfo}>  
                              <span className={styles.documentName}>{doc.name}</span>  
                              {/* <span className={styles.documentPath}>{doc.path}</span>   */}
                              <span className={styles.documentDate}>{doc.lastModified}</span>  
                            </div>  
                          </div>  
                        ))}  
                      </div>  
                    )}  
                  </div>  
                ))}  
              {status && (  
                <div className={styles.statusIndicator}>  
                  <div className={styles.statusText}>  
                    <Spinner animation="border" size="sm" />  
                    <span>{statusMessages[status]}</span>  
                  </div>  
                  <div className={styles.loadingBar}>  
                    <div className={styles.loadingGradient}></div>  
                  </div>  
                </div>  
              )}  
              <div ref={this.messagesEndRef} />  
            </div>  
   
            <form  
              className={styles.inputContainer}  
              onSubmit={(e) => {  
                e.preventDefault();  
                if (input.trim()) this.processMessage(input);  
                this.setState({ input: '' });  
              }}  
            >  
              <div className={styles.inputWrapper}>  
                <Form.Control  
                  type="text"  
                  value={input}  
                  onChange={(e) => this.setState({ input: e.target.value })}  
                  placeholder="Ask about documents or policies..."  
                  className={styles.modernInput}  
                />  
                <Button variant="primary" type="submit" disabled={!!status} className={styles.sendButton}>  
                  {status ? <Spinner size="sm" /> : '➤'}  
                </Button>  
              </div>  
            </form>  
          </div>  
        </div>  
      );  
    }  
  }  