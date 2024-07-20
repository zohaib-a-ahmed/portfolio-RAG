import os
import sys
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from supabase import create_client, Client
from typing import List, Tuple
from dotenv import load_dotenv

load_dotenv()

# Initialize OpenAI API
openai_api_key = os.environ.get("OPENAI_API_KEY")
if not openai_api_key:
    raise ValueError("OPENAI_API_KEY environment variable not set")

# Initialize Supabase client
supabase_url = os.environ.get("LOCAL_SUPABASE_URL")
supabase_key = os.environ.get("LOCAL_SUPABASE_KEY")
if not supabase_url or not supabase_key:
    raise ValueError("SUPABASE_URL or SUPABASE_KEY environment variable not set")

supabase: Client = create_client(supabase_url, supabase_key)

def split_document(document: str, chunk_size: int = 1000, chunk_overlap: int = 200) -> List[str]:
    """
    Split a document into chunks using LangChain's RecursiveCharacterTextSplitter.
    """
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
    )
    return text_splitter.split_text(document)

def create_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Create embeddings for a list of text chunks using OpenAI's API.
    """
    embeddings = OpenAIEmbeddings(
        openai_api_key=openai_api_key,
        model="text-embedding-3-large",
        dimensions=384)
    return embeddings.embed_documents(texts)

def process_document(file_path: str) -> List[Tuple[str, List[float]]]:
    """
    Process a document: split it into chunks, create embeddings, and return a list of (text, embedding) tuples.
    """
    with open(file_path, 'r', encoding='utf-8') as file:
        document = file.read()
    
    chunks = split_document(document)
    embeddings = create_embeddings(chunks)
    
    return list(zip(chunks, embeddings))

def save_to_supabase(document_name: str, processed_chunks: List[Tuple[str, List[float]]]):
    """
    Save the processed document chunks and their embeddings to Supabase database
    """
    try:
        # Insert the document
        document_response = supabase.table('documents').insert({"name": document_name}).execute()
        document_id = document_response.data[0]['id']

        # Insert document sections
        sections_data = [
            {"document_id": document_id, "content": chunk, "embedding": embedding}
            for chunk, embedding in processed_chunks
        ]
        supabase.table('document_sections').insert(sections_data).execute()
        print(f"Successfully database insert: '{document_name}'.")
    except Exception as e:
        print(f"Error saving to Supabase: {e}")
        if hasattr(e, 'response'):
            print(f"Response content: {e.response.content}")

def main(file_path: str):
    if not os.path.exists(file_path):
        print(f"Error: File '{file_path}' does not exist.")
        return

    document_name = os.path.basename(file_path)
    print(f"Processing document: {document_name}")

    try:
        processed_chunks = process_document(file_path)
        save_to_supabase(document_name, processed_chunks)
    except Exception as e:
        print(f"Error processing document: {e}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python script_name.py <path_to_file>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    main(file_path)